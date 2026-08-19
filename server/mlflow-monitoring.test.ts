import { describe, expect, it, vi } from 'vitest';
import type { CatalogSnapshot } from '../shared/domain.js';
import type { CurationContext, ThemeCurationResult } from './ai-curation.js';
import { createModelMonitoring, normalizeDatabricksHost } from './mlflow-monitoring.js';

const emptySnapshot: CatalogSnapshot = {
  users: [],
  movies: [],
  interactions: [],
  qualitySignals: [],
  criticCommentary: [],
};

const emptyContext: CurationContext = {
  userId: 'USR1',
  preferredGenre: 'Drama',
  watchTimePreference: 'weekday_evening',
  preferredDevice: 'smart_tv',
  positiveHistory: [],
  candidates: [],
};

describe('createModelMonitoring', () => {
  it('keeps local development operational when no MLflow experiment is configured', async () => {
    const monitoring = createModelMonitoring({});
    const result: ThemeCurationResult = { source: 'deterministic-fallback', themes: [] };
    const operation = vi.fn().mockResolvedValue(result);
    const ragOperation = vi.fn().mockResolvedValue({
      curation: result,
      retrieval: { source: 'deterministic-fallback', movies: [] },
    });

    await expect(monitoring.observeCuration(emptyContext, operation)).resolves.toBe(result);
    await expect(monitoring.observeRagRecommendation(ragOperation)).resolves.toEqual({
      curation: result,
      retrieval: { source: 'deterministic-fallback', movies: [] },
    });
    await expect(monitoring.evaluateRecommendations(emptySnapshot)).resolves.toMatchObject({
      k: 10,
      evaluatedUsers: 0,
      recallAtK: 0,
    });
    expect(monitoring.enabled).toBe(false);
    expect(operation).toHaveBeenCalledOnce();
    expect(ragOperation).toHaveBeenCalledOnce();
  });

  it('logs recommendation evaluation metrics as a completed MLflow run', async () => {
    const createRun = vi.fn().mockResolvedValue({ run: { info: { run_id: 'run-1' } } });
    const loggedBatches: unknown[] = [];
    const logBatch = vi.fn((request: unknown) => {
      loggedBatches.push(request);
      return Promise.resolve({});
    });
    const updateRun = vi.fn().mockResolvedValue({});
    const createExperimentsClient = vi.fn().mockReturnValue({ createRun, logBatch, updateRun });
    const monitoring = createModelMonitoring(
      {
        MLFLOW_EXPERIMENT_ID: 'experiment-1',
        DATABRICKS_HOST: 'dbc-example.cloud.databricks.com',
      },
      createExperimentsClient
    );

    await monitoring.evaluateRecommendations(emptySnapshot);

    expect(createExperimentsClient).toHaveBeenCalledWith('https://dbc-example.cloud.databricks.com');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        experiment_id: 'experiment-1',
        run_name: 'sceneflow.deterministic_fallback_offline_evaluation',
      })
    );
    const loggedBatch = loggedBatches[0] as {
      run_id: string;
      metrics: Array<{ key: string; value: number }>;
      params: Array<{ key: string; value: string }>;
    };
    expect(loggedBatch.run_id).toBe('run-1');
    expect(loggedBatch.metrics).toContainEqual(expect.objectContaining({ key: 'recall_at_10', value: 0 }));
    expect(loggedBatch.metrics).toContainEqual(expect.objectContaining({ key: 'catalog_coverage_at_10', value: 0 }));
    expect(loggedBatch.params).toContainEqual({
      key: 'evaluation_method',
      value: 'temporal-leave-one-out',
    });
    expect(updateRun).toHaveBeenCalledWith(expect.objectContaining({ run_id: 'run-1', status: 'FINISHED' }));
    expect(monitoring.enabled).toBe(true);
  });

  it('logs labeled AI Search retrieval metrics as a completed MLflow run', async () => {
    const createRun = vi.fn().mockResolvedValue({ run: { info: { run_id: 'run-2' } } });
    const loggedBatches: unknown[] = [];
    const logBatch = vi.fn((request: unknown) => {
      loggedBatches.push(request);
      return Promise.resolve({});
    });
    const updateRun = vi.fn().mockResolvedValue({});
    const monitoring = createModelMonitoring({ MLFLOW_EXPERIMENT_ID: 'experiment-1' }, () => ({
      createRun,
      logBatch,
      updateRun,
    }));

    await monitoring.recordAiSearchEvaluation({
      datasetName: 'sceneflow_ai_search_relevance',
      datasetVersion: '1',
      metrics: {
        k: 10,
        evaluatedQueries: 16,
        failedQueries: 0,
        hitRateAtK: 1,
        recallAtK: 0.9,
        meanReciprocalRankAtK: 0.8,
        normalizedDiscountedCumulativeGainAtK: 0.85,
        averageLatencyMs: 100,
        p95LatencyMs: 150,
      },
      cases: [],
    });

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ run_name: 'sceneflow.ai_search_offline_evaluation' })
    );
    const loggedBatch = loggedBatches[0] as {
      metrics: Array<{ key: string; value: number }>;
      params: Array<{ key: string; value: string }>;
    };
    expect(loggedBatch.metrics).toContainEqual(expect.objectContaining({ key: 'recall_at_10', value: 0.9 }));
    expect(loggedBatch.metrics).toContainEqual(expect.objectContaining({ key: 'p95_latency_ms', value: 150 }));
    expect(loggedBatch.params).toContainEqual({
      key: 'dataset_name',
      value: 'sceneflow_ai_search_relevance',
    });
    expect(loggedBatch.params).toContainEqual({ key: 'dataset_version', value: '1' });
  });
});

describe('normalizeDatabricksHost', () => {
  it('adds the HTTPS scheme used by the MLflow trace exporter', () => {
    expect(normalizeDatabricksHost('dbc-example.cloud.databricks.com')).toBe(
      'https://dbc-example.cloud.databricks.com'
    );
  });

  it('preserves an explicit HTTP scheme and ignores empty values', () => {
    expect(normalizeDatabricksHost(' https://dbc-example.cloud.databricks.com ')).toBe(
      'https://dbc-example.cloud.databricks.com'
    );
    expect(normalizeDatabricksHost('')).toBeUndefined();
  });
});
