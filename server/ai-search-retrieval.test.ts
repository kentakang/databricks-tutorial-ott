import { describe, expect, it, vi } from 'vitest';
import type { CurationContext } from './ai-curation.js';
import { AiSearchRecommendationRetriever, buildAiSearchQuery, parseAiSearchResponse } from './ai-search-retrieval.js';

const context: CurationContext = {
  userId: 'USR_SECRET',
  preferredGenre: 'Drama',
  watchTimePreference: 'late_night',
  preferredDevice: 'smart_tv',
  positiveHistory: [
    {
      title: '서울의 밤',
      primaryGenre: 'Drama',
      genreDetail: '생활 드라마',
      setting: '서울',
      keywords: '이웃|회복',
      preferenceSignal: 0.9,
    },
  ],
  candidates: [],
};

const searchResponse = (movieIds: string[]) => ({
  results: movieIds.map((movieId, index) => ({
    score: String(1 - index / 100),
    data: { movie_id: movieId },
  })),
});

describe('buildAiSearchQuery', () => {
  it('uses taste evidence without exposing the synthetic user identifier', () => {
    const query = buildAiSearchQuery(context);

    expect(query).toContain('서울의 밤');
    expect(query).toContain('late_night');
    expect(query).not.toContain(context.userId);
  });
});

describe('parseAiSearchResponse', () => {
  it('keeps valid, unwatched results in search order and removes duplicates', () => {
    const result = parseAiSearchResponse(
      searchResponse(['MOV1', 'MOV2', 'MOV1', 'UNKNOWN', 'MOV3']),
      new Set(['MOV1', 'MOV2', 'MOV3']),
      new Set(['MOV2'])
    );

    expect(result).toEqual([
      { movieId: 'MOV1', rank: 1, score: 1 },
      { movieId: 'MOV3', rank: 2, score: 0.96 },
    ]);
  });

  it('rejects malformed responses instead of treating them as grounded retrieval', () => {
    expect(() => parseAiSearchResponse({}, new Set(), new Set())).toThrow(/results array/u);
  });
});

describe('AiSearchRecommendationRetriever', () => {
  it('requests hybrid retrieval and requires enough candidates for four themes', async () => {
    const movieIds = Array.from({ length: 32 }, (_, index) => `MOV${index + 1}`);
    const invoke = vi.fn().mockResolvedValue(searchResponse(movieIds));
    const retriever = new AiSearchRecommendationRetriever(invoke);

    const result = await retriever.retrieve(context, new Set(movieIds), new Set());

    expect(result.source).toBe('ai-search');
    expect(result.movies).toHaveLength(32);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ columns: ['movie_id'], numResults: 64, queryType: 'hybrid' })
    );
  });

  it('fails closed when retrieval cannot ground every theme', async () => {
    const movieIds = Array.from({ length: 31 }, (_, index) => `MOV${index + 1}`);
    const retriever = new AiSearchRecommendationRetriever(vi.fn().mockResolvedValue(searchResponse(movieIds)));

    await expect(retriever.retrieve(context, new Set(movieIds), new Set())).rejects.toThrow(/at least 32/u);
  });
});
