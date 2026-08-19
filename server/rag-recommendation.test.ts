import { describe, expect, it, vi } from 'vitest';
import type { CatalogSnapshot, Movie, UserProfile } from '../shared/domain.js';
import type { CurationContext, ThemeCurationResult } from './ai-curation.js';
import { RagRecommendationService } from './rag-recommendation.js';

const profile: UserProfile = {
  userId: 'USR1',
  displayName: '사용자',
  birthYear: 1990,
  preferredLanguage: 'ko',
  subscriptionPlan: 'premium',
  preferredGenre: 'Drama',
  preferredDevice: 'smart_tv',
  watchTimePreference: 'late_night',
  householdType: 'single',
};

const movie = (index: number): Movie => ({
  movieId: `MOV${index}`,
  title: `영화 ${index}`,
  releaseDate: '2026-01-01',
  primaryGenre: index % 2 === 0 ? 'Drama' : 'Thriller',
  genreDetail: '한국 장편 영화',
  productionCountry: '대한민국',
  originalLanguage: 'ko',
  runtimeMinutes: 100,
  contentRating: '15+',
  directorName: '감독',
  studioName: '스튜디오',
  theatricalAdmissions: 1000,
  platformReleaseDate: '2026-02-01',
  isPlatformOriginal: false,
  setting: '서울',
  protagonist: '주인공',
  coreConflict: '선택',
  keywords: `취향${index}`,
  logline: `영화 ${index}의 이야기`,
});

const snapshot: CatalogSnapshot = {
  users: [profile],
  movies: Array.from({ length: 40 }, (_, index) => movie(index + 1)),
  interactions: [],
  qualitySignals: [],
  criticCommentary: [],
};

const curation: ThemeCurationResult = {
  source: 'foundation-model',
  themes: [],
};

describe('RagRecommendationService', () => {
  it('passes only AI Search-ranked candidates to generation and caches the combined result', async () => {
    const retrievedIds = Array.from({ length: 32 }, (_, index) => `MOV${40 - index}`);
    const retrieve = vi.fn().mockResolvedValue({
      source: 'ai-search',
      movies: retrievedIds.map((movieId, index) => ({ movieId, rank: index + 1, score: null })),
    });
    const curate = vi.fn().mockResolvedValue(curation);
    const service = new RagRecommendationService(retrieve, curate);

    const first = await service.recommend(snapshot, profile.userId);
    const second = await service.recommend(snapshot, profile.userId);
    const groundedContext = curate.mock.calls[0]?.[0] as CurationContext | undefined;

    expect(first).toBe(second);
    expect(groundedContext?.candidates.map((candidate) => candidate.movieId)).toEqual(retrievedIds);
    expect(retrieve).toHaveBeenCalledOnce();
    expect(curate).toHaveBeenCalledOnce();
  });

  it('uses deterministic candidates when AI Search is unavailable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new RagRecommendationService(
      vi.fn().mockRejectedValue(new Error('index unavailable')),
      vi.fn().mockResolvedValue(curation)
    );

    const result = await service.recommend(snapshot, profile.userId);

    expect(result.retrieval).toEqual({ source: 'deterministic-fallback', movies: [] });
    warning.mockRestore();
  });
});
