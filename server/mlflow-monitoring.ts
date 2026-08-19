import * as mlflow from 'mlflow-tracing';
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

  async observeRagRecommendation(operation: () => Promise<RagRecommendationResult>): Promise<RagRecommendationResult> {
    const startedAt = Date.now();
    const span = mlflow.startSpan({
      name: 'sceneflow.rag_recommendation',
      spanType: mlflow.SpanType.CHAIN,
      inputs: { retrievalStrategy: 'ai-search-hybrid' },
      attributes: {
        'sceneflow.component': 'rag-recommendation',
        'sceneflow.evaluation.version': '1',
      },
    });

    try {
      const result = await operation();
      span.end({
        outputs: {
          retrievalSource: result.retrieval.source,
          retrievedCandidateCount: result.retrieval.movies.length,
          curationSource: result.curation.source,
          latencyMs: Date.now() - startedAt,
        },
        attributes: {
          'sceneflow.rag.retrieval_source': result.retrieval.source,
          'sceneflow.rag.degraded':
            result.retrieval.source !== 'ai-search' || result.curation.source !== 'foundation-model',
        },
        status: mlflow.SpanStatusCode.OK,
      });
      return result;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      span.recordException(normalizedError);
      span.end({
        outputs: { latencyMs: Date.now() - startedAt },
        status: mlflow.SpanStatusCode.ERROR,
      });
      throw error;
    }
  }

  async observeCuration(
    context: CurationContext,
    operation: () => Promise<ThemeCurationResult>
  ): Promise<ThemeCurationResult> {
    const startedAt = Date.now();
    const span = mlflow.startSpan({
      name: 'sceneflow.ai_curation',
      spanType: mlflow.SpanType.CHAIN,
      inputs: {
        candidateCount: context.candidates.length,
        positiveHistoryCount: context.positiveHistory.length,
        preferredGenre: context.preferredGenre,
      },
      attributes: {
        'sceneflow.component': 'ai-curation',
        'sceneflow.evaluation.version': '1',
      },
    });

    try {
      const result = await operation();
      const metrics = curationMetrics(result, Date.now() - startedAt);
      span.end({
        outputs: metrics,
        attributes: {
          'sceneflow.curation.source': result.source,
          'sceneflow.curation.degraded': result.source !== 'foundation-model',
        },
        status: mlflow.SpanStatusCode.OK,
      });
      return result;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      span.recordException(normalizedError);
      span.end({
        outputs: { latencyMs: Date.now() - startedAt },
        status: mlflow.SpanStatusCode.ERROR,
      });
      throw error;
    }
  }

  evaluateRecommendations(snapshot: CatalogSnapshot): Promise<RecommendationEvaluationMetrics> {
    const startedAt = Date.now();
    const metrics = evaluateRecommendationQuality(snapshot, EVALUATION_CUTOFF);
    const span = mlflow.startSpan({
      name: 'sceneflow.deterministic_fallback_offline_evaluation',
      spanType: mlflow.SpanType.RERANKER,
      inputs: {
        userCount: snapshot.users.length,
        movieCount: snapshot.movies.length,
        interactionCount: snapshot.interactions.length,
        evaluationMethod: 'temporal-leave-one-out',
      },
      attributes: {
        'sceneflow.component': 'deterministic-fallback-ranker',
        'sceneflow.evaluation.version': '1',
      },
    });
    span.end({
      outputs: { ...metrics, latencyMs: Date.now() - startedAt },
      status: mlflow.SpanStatusCode.OK,
    });

    return Promise.resolve(metrics);
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

export function createModelMonitoring(env: NodeJS.ProcessEnv = process.env): ModelMonitoring {
  const experimentId = env.MLFLOW_EXPERIMENT_ID?.trim();
  if (!experimentId) return new LocalModelMonitoring();

  try {
    const trackingUri = env.MLFLOW_TRACKING_URI?.trim() || 'databricks';
    const databricksHost = normalizeDatabricksHost(env.DATABRICKS_HOST);
    const usesDatabricksTracking = trackingUri === 'databricks' || trackingUri.startsWith('databricks://');

    mlflow.init({
      trackingUri,
      experimentId,
      ...(usesDatabricksTracking && databricksHost ? { host: databricksHost } : {}),
    });
    return new MlflowModelMonitoring();
  } catch (error) {
    console.error('MLflow monitoring initialization failed; continuing without trace export.', error);
    return new LocalModelMonitoring();
  }
}
