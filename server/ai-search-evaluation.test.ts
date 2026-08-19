import { describe, expect, it, vi } from 'vitest';
import rawDataset from '../config/evaluation/ai-search-relevance.v1.json';
import {
  evaluateAiSearchRelevance,
  parseQueryIndexMovieIds,
  validateAiSearchEvaluationDataset,
  type AiSearchEvaluationDataset,
} from './ai-search-evaluation.js';

const dataset: AiSearchEvaluationDataset = {
  name: 'test_relevance',
  version: '1',
  description: 'Test dataset',
  default_k: 3,
  records: [
    {
      dataset_record_id: 'first',
      inputs: { query_text: 'first query' },
      expectations: {
        expected_retrieved_context: [{ doc_uri: 'sceneflow://movies/MOV0001' }],
      },
    },
    {
      dataset_record_id: 'second',
      inputs: { query_text: 'second query' },
      expectations: {
        expected_retrieved_context: [
          { doc_uri: 'sceneflow://movies/MOV0002' },
          { doc_uri: 'sceneflow://movies/MOV0003' },
        ],
      },
    },
  ],
};

describe('validateAiSearchEvaluationDataset', () => {
  it('accepts MLflow-shaped inputs and expected retrieval documents', () => {
    expect(validateAiSearchEvaluationDataset(dataset)).toBe(dataset);
  });

  it('rejects duplicate record IDs and invalid movie document URIs', () => {
    expect(() =>
      validateAiSearchEvaluationDataset({ ...dataset, records: [dataset.records[0], dataset.records[0]] })
    ).toThrow(/unique/u);
    expect(() =>
      validateAiSearchEvaluationDataset({
        ...dataset,
        records: [
          {
            ...dataset.records[0],
            expectations: { expected_retrieved_context: [{ doc_uri: 'movie://MOV0001' }] },
          },
        ],
      })
    ).toThrow(/sceneflow/u);
  });

  it('keeps the committed v1 dataset valid and representative of every catalog genre', () => {
    const validated = validateAiSearchEvaluationDataset(rawDataset);
    const coveredGenres = new Set(
      validated.records.map((record) => record.tags?.genre).filter((genre) => genre !== 'cross-genre')
    );

    expect(validated.records).toHaveLength(16);
    expect(coveredGenres).toEqual(
      new Set([
        'Action',
        'Animation',
        'Comedy',
        'Documentary',
        'Drama',
        'Fantasy',
        'Horror',
        'Romance',
        'Science Fiction',
        'Thriller',
      ])
    );
  });
});

describe('parseQueryIndexMovieIds', () => {
  it('uses the response manifest and removes malformed or duplicate IDs', () => {
    expect(
      parseQueryIndexMovieIds({
        manifest: { columns: [{ name: 'score' }, { name: 'movie_id' }] },
        result: {
          data_array: [
            [0.9, 'MOV0001'],
            [0.8, 'MOV0001'],
            [0.7, 'invalid'],
            [0.6, 'MOV0002'],
          ],
        },
      })
    ).toEqual(['MOV0001', 'MOV0002']);
  });
});

describe('evaluateAiSearchRelevance', () => {
  it('computes query-level recall, MRR, NDCG, hit rate, and latency', async () => {
    const retrieve = vi.fn((query: string) => {
      return Promise.resolve(query === 'first query' ? ['MOV0001'] : ['MOV9999', 'MOV0002']);
    });
    let clock = 0;

    const result = await evaluateAiSearchRelevance(dataset, retrieve, () => {
      clock += 10;
      return clock;
    });

    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(result.metrics).toMatchObject({
      k: 3,
      evaluatedQueries: 2,
      failedQueries: 0,
      hitRateAtK: 1,
      recallAtK: 0.75,
      meanReciprocalRankAtK: 0.75,
      averageLatencyMs: 10,
      p95LatencyMs: 10,
    });
    expect(result.metrics.normalizedDiscountedCumulativeGainAtK).toBeCloseTo(0.6934, 4);
  });

  it('keeps failed queries in the aggregate as zero-quality results', async () => {
    const result = await evaluateAiSearchRelevance(dataset, () => Promise.reject(new Error('unavailable')));

    expect(result.metrics).toMatchObject({
      evaluatedQueries: 2,
      failedQueries: 2,
      hitRateAtK: 0,
      recallAtK: 0,
      meanReciprocalRankAtK: 0,
    });
    expect(result.cases.every((item) => item.errorType === 'Error')).toBe(true);
  });
});
