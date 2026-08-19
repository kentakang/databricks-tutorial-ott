import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot, CriticCommentary, UserProfile, ViewerInteraction } from '../shared/domain.js';
import { buildMovieReviews } from './movie-reviews.js';

const profile = (userId: string, displayName: string): UserProfile => ({
  userId,
  displayName,
  birthYear: 1990,
  preferredLanguage: 'ko',
  subscriptionPlan: 'premium',
  preferredGenre: 'Drama',
  preferredDevice: 'tv',
  watchTimePreference: 'evening',
  householdType: 'single',
});

const interaction = (
  viewingId: string,
  userId: string,
  movieId: string,
  reviewedAt: string,
  reviewText: string | null = '좋은 작품입니다.'
): ViewerInteraction => ({
  viewingId,
  userId,
  movieId,
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: '2026-01-01T01:00:00Z',
  watchMinutes: 100,
  completionPct: 100,
  playbackStatus: 'completed',
  deviceType: 'tv',
  streamingQuality: 'uhd',
  rewatchNumber: 0,
  discoverySource: 'home',
  rating: 4.5,
  reviewTitle: reviewText ? '추천해요' : null,
  reviewText,
  reviewedAt,
});

const criticReview = (
  criticReviewId: string,
  movieId: string,
  isTopCritic: boolean,
  score100: number
): CriticCommentary => ({
  criticReviewId,
  movieId,
  score100,
  letterGrade: 'A',
  reviewTitle: '인상적인 영화',
  reviewText: '정교한 연출이 돋보인다.',
  reviewedAt: '2026-01-02T00:00:00Z',
  verdict: '호평',
  recommended: true,
  criticName: '평론가',
  penName: `필명 ${criticReviewId}`,
  publicationName: '시네마 저널',
  yearsExperience: 10,
  specialtyGenre: 'Drama',
  isTopCritic,
});

const snapshot = (interactions: ViewerInteraction[], criticCommentary: CriticCommentary[]): CatalogSnapshot => ({
  users: [profile('USR1', '민준'), profile('USR2', '서연')],
  movies: [],
  interactions,
  qualitySignals: [],
  criticCommentary,
});

describe('buildMovieReviews', () => {
  it('returns every written review for the selected movie with synthetic display names', () => {
    const result = buildMovieReviews(
      snapshot(
        [
          interaction('VIEW1', 'USR1', 'MOV1', '2026-01-01T00:00:00Z'),
          interaction('VIEW2', 'USR2', 'MOV1', '2026-01-03T00:00:00Z'),
          interaction('VIEW3', 'USR1', 'MOV2', '2026-01-04T00:00:00Z'),
          interaction('VIEW4', 'USR1', 'MOV1', '2026-01-05T00:00:00Z', null),
        ],
        [criticReview('CR1', 'MOV1', false, 95), criticReview('CR2', 'MOV2', true, 80)]
      ),
      'MOV1'
    );

    expect(result.criticReviews.map((review) => review.criticReviewId)).toEqual(['CR1']);
    expect(result.userReviews.map((review) => review.reviewId)).toEqual(['VIEW2', 'VIEW1']);
    expect(result.userReviews.map((review) => review.displayName)).toEqual(['서연', '민준']);
  });

  it('puts top critics ahead of a higher-scoring general review', () => {
    const result = buildMovieReviews(
      snapshot([], [criticReview('GENERAL', 'MOV1', false, 100), criticReview('TOP', 'MOV1', true, 80)]),
      'MOV1'
    );

    expect(result.criticReviews.map((review) => review.criticReviewId)).toEqual(['TOP', 'GENERAL']);
  });
});
