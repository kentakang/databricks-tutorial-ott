import { WorkspaceClient } from '@databricks/sdk-experimental';
import type { CatalogSnapshot } from '../shared/domain.js';
import type { CurationContext, ThemeCurationResult } from './ai-curation.js';
import { evaluateRecommendationQuality, type RecommendationEvaluationMetrics } from './recommendation-evaluation.js';
import type { RagRecommendationResult } from './rag-recommendation.js';

const EVALUATION_CUTOFF = 10;

export function normalizeDatabricksHost(host: string | undefined): string | undefined {
  const normalizedHost = host?.trim();
  if (!normalizedHost) return undefined;

  return /^https?:\/\//i.test(normalizedHost) ? normalizedHost : `https://${normalizedHost}`;
}

interface CurationMetrics {
  source: ThemeCurationResult['source'];
  themeCount: number;
  recommendedMovieCount: number;
  uniqueMovieRatio: number;
  latencyMs: number;
}

type ExperimentsClient = Pick<WorkspaceClient['experiments'], 'createRun' | 'logBatch' | 'updateRun'>;
type ExperimentsClientFactory = (host: string | undefined) => ExperimentsClient;

interface MlflowRunRecord {
  name: string;
  startTime: number;
  metrics: Record<string, number>;
  params?: Record<string, string | number>;
  tags?: Record<string, string>;
  status?: 'FAILED' | 'FINISHED';
}

class MlflowRunLogger {
  constructor(
    private readonly experimentId: string,
    private readonly experiments: ExperimentsClient
  ) {}

  async log(record: MlflowRunRecord): Promise<void> {
    let runId: string | undefined;

    try {
      const created = await this.experiments.createRun({
        experiment_id: this.experimentId,
        run_name: record.name,
        start_time: record.startTime,
        tags: Object.entries(record.tags ?? {}).map(([key, value]) => ({ key, value })),
      });
      runId = created.run?.info?.run_id;
      if (!runId) throw new Error('MLflow createRun response did not include a run ID.');

      const timestamp = Date.now();
      await this.experiments.logBatch({
        run_id: runId,
        metrics: Object.entries(record.metrics).map(([key, value]) => ({
          key,
          value,
          timestamp,
          step: 0,
        })),
        params: Object.entries(record.params ?? {}).map(([key, value]) => ({
          key,
          value: String(value),
        })),
      });
      await this.experiments.updateRun({
        run_id: runId,
        end_time: Date.now(),
        status: record.status ?? 'FINISHED',
      });
    } catch (error) {
      if (runId && record.status !== 'FAILED') {
        try {
          await this.experiments.updateRun({ run_id: runId, end_time: Date.now(), status: 'FAILED' });
        } catch (updateError) {
          console.error('Failed to mark the MLflow monitoring run as failed.', updateError);
        }
      }
      throw error;
    }
  }
}

export interface ModelMonitoring {
  readonly enabled: boolean;
  observeRagRecommendation(operation: () => Promise<RagRecommendationResult>): Promise<RagRecommendationResult>;
  observeCuration(
    context: CurationContext,
    operation: () => Promise<ThemeCurationResult>
  ): Promise<ThemeCurationResult>;
  evaluateRecommendations(snapshot: CatalogSnapshot): Promise<RecommendationEvaluationMetrics>;
}

function curationMetrics(result: ThemeCurationResult, latencyMs: number): CurationMetrics {
  const movieIds = result.themes.flatMap((theme) => theme.movieIds);

  return {
    source: result.source,
    themeCount: result.themes.length,
    recommendedMovieCount: movieIds.length,
    uniqueMovieRatio: new Set(movieIds).size / Math.max(1, movieIds.length),
    latencyMs,
  };
}

class MlflowModelMonitoring implements ModelMonitoring {
  readonly enabled = true;

  constructor(private readonly logger: MlflowRunLogger) {}

  private async log(record: MlflowRunRecord): Promise<void> {
    try {
      await this.logger.log(record);
    } catch (error) {
      console.error('Failed to log MLflow monitoring metrics; application behavior is unchanged.', error);
    }
  }

  async observeRagRecommendation(operation: () => Promise<RagRecommendationResult>): Promise<RagRecommendationResult> {
    const startedAt = Date.now();

    try {
      const result = await operation();
      await this.log({
        name: 'sceneflow.rag_recommendation',
        startTime: startedAt,
        metrics: {
          retrieved_candidate_count: result.retrieval.movies.length,
          latency_ms: Date.now() - startedAt,
          degraded: result.retrieval.source === 'ai-search' && result.curation.source === 'foundation-model' ? 0 : 1,
        },
        params: { retrieval_strategy: 'ai-search-hybrid' },
        tags: {
          'sceneflow.component': 'rag-recommendation',
          'sceneflow.evaluation.version': '1',
          'sceneflow.rag.retrieval_source': result.retrieval.source,
          'sceneflow.rag.curation_source': result.curation.source,
        },
      });
      return result;
    } catch (error) {
      await this.log({
        name: 'sceneflow.rag_recommendation',
        startTime: startedAt,
        metrics: { latency_ms: Date.now() - startedAt },
        tags: {
          'sceneflow.component': 'rag-recommendation',
          'sceneflow.evaluation.version': '1',
          'sceneflow.error.type': error instanceof Error ? error.name : 'UnknownError',
        },
        status: 'FAILED',
      });
      throw error;
    }
  }

  async observeCuration(
    context: CurationContext,
    operation: () => Promise<ThemeCurationResult>
  ): Promise<ThemeCurationResult> {
    const startedAt = Date.now();

    try {
      const result = await operation();
      const metrics = curationMetrics(result, Date.now() - startedAt);
      await this.log({
        name: 'sceneflow.ai_curation',
        startTime: startedAt,
        metrics: {
          theme_count: metrics.themeCount,
          recommended_movie_count: metrics.recommendedMovieCount,
          unique_movie_ratio: metrics.uniqueMovieRatio,
          latency_ms: metrics.latencyMs,
          degraded: result.source === 'foundation-model' ? 0 : 1,
        },
        params: {
          candidate_count: context.candidates.length,
          positive_history_count: context.positiveHistory.length,
          preferred_genre: context.preferredGenre,
        },
        tags: {
          'sceneflow.component': 'ai-curation',
          'sceneflow.evaluation.version': '1',
          'sceneflow.curation.source': result.source,
        },
      });
      return result;
    } catch (error) {
      await this.log({
        name: 'sceneflow.ai_curation',
        startTime: startedAt,
        metrics: { latency_ms: Date.now() - startedAt },
        tags: {
          'sceneflow.component': 'ai-curation',
          'sceneflow.evaluation.version': '1',
          'sceneflow.error.type': error instanceof Error ? error.name : 'UnknownError',
        },
        status: 'FAILED',
      });
      throw error;
    }
  }

  async evaluateRecommendations(snapshot: CatalogSnapshot): Promise<RecommendationEvaluationMetrics> {
    const startedAt = Date.now();
    const metrics = evaluateRecommendationQuality(snapshot, EVALUATION_CUTOFF);
    await this.log({
      name: 'sceneflow.deterministic_fallback_offline_evaluation',
      startTime: startedAt,
      metrics: {
        [`recall_at_${metrics.k}`]: metrics.recallAtK,
        [`mrr_at_${metrics.k}`]: metrics.meanReciprocalRankAtK,
        [`ndcg_at_${metrics.k}`]: metrics.normalizedDiscountedCumulativeGainAtK,
        [`catalog_coverage_at_${metrics.k}`]: metrics.catalogCoverageAtK,
        evaluated_users: metrics.evaluatedUsers,
        skipped_users: metrics.skippedUsers,
        latency_ms: Date.now() - startedAt,
      },
      params: {
        k: metrics.k,
        evaluation_method: 'temporal-leave-one-out',
        user_count: snapshot.users.length,
        movie_count: snapshot.movies.length,
        interaction_count: snapshot.interactions.length,
      },
      tags: {
        'sceneflow.component': 'deterministic-fallback-ranker',
        'sceneflow.evaluation.version': '1',
      },
    });

    return metrics;
  }
}

class LocalModelMonitoring implements ModelMonitoring {
  readonly enabled = false;

  observeRagRecommendation(operation: () => Promise<RagRecommendationResult>): Promise<RagRecommendationResult> {
    return operation();
  }

  observeCuration(
    _context: CurationContext,
    operation: () => Promise<ThemeCurationResult>
  ): Promise<ThemeCurationResult> {
    return operation();
  }

  evaluateRecommendations(snapshot: CatalogSnapshot): Promise<RecommendationEvaluationMetrics> {
    return Promise.resolve(evaluateRecommendationQuality(snapshot, EVALUATION_CUTOFF));
  }
}

export function createModelMonitoring(
  env: NodeJS.ProcessEnv = process.env,
  createExperimentsClient: ExperimentsClientFactory = (host) => new WorkspaceClient({ host }).experiments
): ModelMonitoring {
  const experimentId = env.MLFLOW_EXPERIMENT_ID?.trim();
  if (!experimentId) return new LocalModelMonitoring();

  try {
    const databricksHost = normalizeDatabricksHost(env.DATABRICKS_HOST);
    const experiments = createExperimentsClient(databricksHost);
    return new MlflowModelMonitoring(new MlflowRunLogger(experimentId, experiments));
  } catch (error) {
    console.error('MLflow monitoring initialization failed; continuing without metric logging.', error);
    return new LocalModelMonitoring();
  }
}
