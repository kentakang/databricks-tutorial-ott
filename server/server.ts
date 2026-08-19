import { analytics, createApp, getExecutionContext, server } from '@databricks/appkit';
import { AiCurationService, createFallbackCuration } from './ai-curation.js';
import { CatalogRepository } from './catalog-repository.js';
import { createModelMonitoring } from './mlflow-monitoring.js';
import { buildMovieReviews } from './movie-reviews.js';
import { buildCurationContext, buildHomeFeed } from './recommendation-engine.js';

const userIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const movieIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const evaluationIntervalMs = 30 * 60 * 1000;

await createApp({
  plugins: [analytics(), server()],
  onPluginsReady(appkit) {
    const repository = new CatalogRepository((statement) => appkit.analytics.query(statement));
    const monitoring = createModelMonitoring();
    let nextEvaluationAt = 0;
    let evaluationRunning = false;

    const scheduleEvaluation = (snapshot: Awaited<ReturnType<typeof repository.getSnapshot>>) => {
      if (evaluationRunning || Date.now() < nextEvaluationAt) return;

      evaluationRunning = true;
      nextEvaluationAt = Date.now() + evaluationIntervalMs;
      setImmediate(() => {
        void monitoring
          .evaluateRecommendations(snapshot)
          .then((metrics) => {
            console.info('Recommendation quality evaluation completed.', {
              mlflowEnabled: monitoring.enabled,
              ...metrics,
            });
          })
          .catch((error: unknown) => {
            console.error('Recommendation quality evaluation failed.', error);
          })
          .finally(() => {
            evaluationRunning = false;
          });
      });
    };

    const getSnapshot = async () => {
      const snapshot = await repository.getSnapshot();
      scheduleEvaluation(snapshot);
      return snapshot;
    };

    const aiCuration = new AiCurationService(
      async (request) => {
        const endpointName = process.env.DATABRICKS_SERVING_ENDPOINT_NAME;
        if (!endpointName) throw new Error('AI curation endpoint is not configured.');

        return getExecutionContext().client.servingEndpoints.query({
          name: endpointName,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        });
      },
      Date.now,
      (context, operation) => monitoring.observeCuration(context, operation)
    );

    appkit.server.extend((app) => {
      app.get('/api/users', async (_request, response) => {
        try {
          const snapshot = await getSnapshot();
          response.setHeader('Cache-Control', 'private, max-age=60');
          response.json(
            snapshot.users.map((profile) => ({
              userId: profile.userId,
              displayName: profile.displayName,
              preferredGenre: profile.preferredGenre,
              subscriptionPlan: profile.subscriptionPlan,
            }))
          );
        } catch (error) {
          console.error('Failed to load consumer profiles.', error);
          response.status(503).json({
            error: '추천 데이터를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.',
          });
        }
      });

      app.get('/api/home/:userId', async (request, response) => {
        const userId = request.params.userId;
        if (!userIdPattern.test(userId)) {
          response.status(400).json({ error: '올바르지 않은 사용자 식별자입니다.' });
          return;
        }

        try {
          const snapshot = await getSnapshot();
          if (!snapshot.users.some((profile) => profile.userId === userId)) {
            response.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            return;
          }

          const context = buildCurationContext(snapshot, userId);
          const cachedCuration = aiCuration.getCached(userId);
          const curation = cachedCuration ?? {
            ...createFallbackCuration(context),
            source: 'ai-pending' as const,
          };
          if (!cachedCuration) void aiCuration.curate(context);
          response.setHeader('Cache-Control', 'private, no-store');
          response.json(buildHomeFeed(snapshot, userId, curation));
        } catch (error) {
          console.error('Failed to build the personalized home feed.', error);
          response.status(503).json({
            error: '개인화 홈을 만드는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          });
        }
      });

      app.get('/api/curation/:userId', async (request, response) => {
        const userId = request.params.userId;
        if (!userIdPattern.test(userId)) {
          response.status(400).json({ error: '올바르지 않은 사용자 식별자입니다.' });
          return;
        }

        try {
          const snapshot = await getSnapshot();
          if (!snapshot.users.some((profile) => profile.userId === userId)) {
            response.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            return;
          }

          const curation = await aiCuration.curate(buildCurationContext(snapshot, userId));
          response.setHeader('Cache-Control', 'private, no-store');
          response.json(buildHomeFeed(snapshot, userId, curation));
        } catch (error) {
          console.error('Failed to build AI curation.', error);
          response.status(503).json({
            error: 'AI 추천 주제를 만드는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          });
        }
      });

      app.get('/api/movies/:movieId/reviews', async (request, response) => {
        const movieId = request.params.movieId;
        if (!movieIdPattern.test(movieId)) {
          response.status(400).json({ error: '올바르지 않은 작품 식별자입니다.' });
          return;
        }

        try {
          const snapshot = await getSnapshot();
          if (!snapshot.movies.some((movie) => movie.movieId === movieId)) {
            response.status(404).json({ error: '작품을 찾을 수 없습니다.' });
            return;
          }

          response.setHeader('Cache-Control', 'private, max-age=60');
          response.json(buildMovieReviews(snapshot, movieId));
        } catch (error) {
          console.error('Failed to load movie reviews.', error);
          response.status(503).json({
            error: '작품 리뷰를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          });
        }
      });
    });
  },
});
