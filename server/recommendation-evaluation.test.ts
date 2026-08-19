import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot, Movie, UserProfile, ViewerInteraction } from '../shared/domain.js';
import { evaluateRecommendationQuality } from './recommendation-evaluation.js';

const profile = (userId: string, preferredGenre = 'Drama'): UserProfile => ({
  userId,
  displayName: userId,
  birthYear: 1990,
  preferredLanguage: 'ko',
  subscriptionPlan: 'premium',
  preferredGenre,
  preferredDevice: 'smart_tv',
  watchTimePreference: 'weekday_evening',
  householdType: 'single',
});

const movie = (movieId: string, primaryGenre: string): Movie => ({
  movieId,
  title: movieId,
  releaseDate: '2026-01-01',
  primaryGenre,
  genreDetail: primaryGenre,
  productionCountry: '대한민국',
  originalLanguage: 'ko',
  runtimeMinutes: 100,
  contentRating: '15+',
  directorName: '감독',
  studioName: '스튜디오',
  theatricalAdmissions: 100,
  platformReleaseDate: '2026-02-01',
  isPlatformOriginal: false,
  setting: primaryGenre,
  protagonist: '주인공',
  coreConflict: '선택',
  keywords: primaryGenre,
  logline: `${primaryGenre} 이야기`,
});

const interaction = (userId: string, movieId: string, startedAt: string, rating: number): ViewerInteraction => ({
  viewingId: `${userId}-${movieId}`,
  userId,
  movieId,
  startedAt,
  endedAt: startedAt,
  watchMinutes: 100,
  completionPct: 100,
  playbackStatus: 'completed',
  deviceType: 'smart_tv',
  streamingQuality: 'uhd',
  rewatchNumber: 0,
  discoverySource: 'home',
  rating,
  reviewTitle: null,
  reviewText: null,
  reviewedAt: startedAt,
});

describe('evaluateRecommendationQuality', () => {
  it('uses the latest positive title as a temporal holdout and reports top-k quality', () => {
    const eligible = profile('USR1');
    const skipped = profile('USR2');
    const movies = [movie('MOV1', 'Drama'), movie('MOV2', 'Drama'), movie('MOV3', 'Horror')];
    const snapshot: CatalogSnapshot = {
      users: [eligible, skipped],
      movies,
      interactions: [
        interaction('USR1', 'MOV1', '2026-01-01T00:00:00Z', 5),
        interaction('USR1', 'MOV2', '2026-02-01T00:00:00Z', 5),
        interaction('USR2', 'MOV3', '2026-01-01T00:00:00Z', 1),
      ],
      qualitySignals: [],
      criticCommentary: [],
    };

    const metrics = evaluateRecommendationQuality(snapshot, 1);

    expect(metrics).toEqual({
      k: 1,
      evaluatedUsers: 1,
      skippedUsers: 1,
      recallAtK: 1,
      meanReciprocalRankAtK: 1,
      normalizedDiscountedCumulativeGainAtK: 1,
      catalogCoverageAtK: 1 / 3,
    });
  });

  it('rejects invalid cutoffs', () => {
    expect(() =>
      evaluateRecommendationQuality(
        {
          users: [],
          movies: [],
          interactions: [],
          qualitySignals: [],
          criticCommentary: [],
        },
        0
      )
    ).toThrow('positive integer');
  });
});
