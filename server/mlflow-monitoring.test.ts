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
