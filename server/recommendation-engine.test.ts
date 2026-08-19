import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot, Movie, UserProfile, ViewerInteraction } from '../shared/domain.js';
import type { ThemeCurationResult } from './ai-curation.js';
import { buildHomeFeed, interactionSignal, rankPersonalized } from './recommendation-engine.js';

const profile = (userId: string, preferredGenre: string): UserProfile => ({
  userId,
  displayName: userId,
  birthYear: 1990,
  preferredLanguage: 'ko',
  subscriptionPlan: 'premium',
  preferredGenre,
  preferredDevice: 'tv',
  watchTimePreference: 'evening',
  householdType: 'single',
});

const movie = (movieId: string, primaryGenre: string): Movie => ({
  movieId,
  title: `${primaryGenre} 작품 ${movieId}`,
  releaseDate: '2025-01-01',
  primaryGenre,
  genreDetail: primaryGenre,
  productionCountry: '대한민국',
  originalLanguage: 'ko',
  runtimeMinutes: 110,
  contentRating: '15+',
  directorName: '감독',
  studioName: '스튜디오',
  theatricalAdmissions: 1000,
  platformReleaseDate: '2025-02-01',
  isPlatformOriginal: false,
  setting: '서울',
  protagonist: '주인공',
  coreConflict: '선택',
  keywords: primaryGenre,
  logline: `${primaryGenre} 장르의 이야기`,
});

const interaction = (
  userId: string,
  movieId: string,
  completionPct: number,
  rating: number | null
): ViewerInteraction => ({
  viewingId: `${userId}-${movieId}`,
  userId,
  movieId,
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: '2026-01-01T01:00:00Z',
  watchMinutes: 100,
  completionPct,
  playbackStatus: 'completed',
  deviceType: 'tv',
  streamingQuality: 'uhd',
  rewatchNumber: 0,
  discoverySource: 'home',
  rating,
  reviewTitle: null,
  reviewText: null,
  reviewedAt: rating === null ? null : '2026-01-01T02:00:00Z',
});

const snapshot = (users: UserProfile[], movies: Movie[], interactions: ViewerInteraction[] = []): CatalogSnapshot => ({
  users,
  movies,
  interactions,
  qualitySignals: [],
  criticCommentary: [],
});

describe('interactionSignal', () => {
  it('lets an explicit low rating override full completion', () => {
    expect(interactionSignal(interaction('USR1', 'MOV1', 100, 1.5))).toBeLessThan(0);
    expect(interactionSignal(interaction('USR1', 'MOV1', 100, null))).toBeGreaterThan(0);
  });
});

describe('rankPersonalized', () => {
  it('excludes titles the selected viewer already watched', () => {
    const user = profile('USR1', '드라마');
    const watched = movie('MOV1', '드라마');
    const unwatched = movie('MOV2', '드라마');
    const result = rankPersonalized(
      snapshot([user], [watched, unwatched], [interaction(user.userId, watched.movieId, 90, 4.5)]),
      user
    );

    expect(result.ranked.map((item) => item.movie.movieId)).toEqual(['MOV2']);
  });

  it('changes the leading recommendation when the selected persona changes', () => {
    const dramaViewer = profile('USR1', '드라마');
    const horrorViewer = profile('USR2', '공포');
    const catalog = [movie('MOV1', '드라마'), movie('MOV2', '공포')];
    const data = snapshot([dramaViewer, horrorViewer], catalog);

    expect(rankPersonalized(data, dramaViewer).ranked[0]?.movie.primaryGenre).toBe('드라마');
    expect(rankPersonalized(data, horrorViewer).ranked[0]?.movie.primaryGenre).toBe('공포');
  });
});

describe('buildHomeFeed', () => {
  it('renders multiple supplied themes without reintroducing watched movies', () => {
    const user = profile('USR1', '드라마');
    const watched = movie('MOV1', '드라마');
    const catalog = [watched, movie('MOV2', '드라마'), movie('MOV3', '공포'), movie('MOV4', '액션')];
    const curation: ThemeCurationResult = {
      source: 'foundation-model',
      themes: [
        { themeId: 'ai-theme-1', title: '첫 번째 주제', subtitle: '첫 번째 설명', movieIds: ['MOV1', 'MOV2'] },
        { themeId: 'ai-theme-2', title: '두 번째 주제', subtitle: '두 번째 설명', movieIds: ['MOV3', 'MOV4'] },
      ],
    };

    const feed = buildHomeFeed(
      snapshot([user], catalog, [interaction(user.userId, watched.movieId, 100, 5)]),
      user.userId,
      curation
    );

    expect(feed.rails.aiThemes).toHaveLength(2);
    expect(feed.rails.aiThemes.flatMap((theme) => theme.movies).map((item) => item.movieId)).toEqual([
      'MOV2',
      'MOV3',
      'MOV4',
    ]);
    expect(feed.aiCuration.source).toBe('foundation-model');
  });

  it('builds the recommendation feed from AI Search retrieval order and exposes grounded evidence', () => {
    const user = profile('USR1', '드라마');
    const catalog = [movie('MOV1', '드라마'), movie('MOV2', '공포'), movie('MOV3', '액션')];
    const curation: ThemeCurationResult = {
      source: 'foundation-model',
      themes: [
        {
          themeId: 'rag-theme-1',
          title: '검색 기반 추천',
          subtitle: 'AI Search가 찾은 작품',
          movieIds: ['MOV3', 'MOV1'],
        },
      ],
    };

    const feed = buildHomeFeed(snapshot([user], catalog), user.userId, curation, [
      { movieId: 'MOV3', rank: 1, score: 0.9 },
      { movieId: 'MOV1', rank: 2, score: 0.8 },
    ]);

    expect(feed.hero.movieId).toBe('MOV3');
    expect(feed.hero.evidence).toContainEqual({
      label: 'AI Search',
      detail: '취향 문맥 Hybrid 검색 상위 1위',
    });
    expect(feed.aiCuration).toMatchObject({
      label: 'Databricks RAG 추천',
      retrievalSource: 'ai-search',
      retrievedCandidateCount: 2,
    });
  });
});
