import type { CatalogSnapshot, UserProfile, ViewerInteraction } from '../shared/domain.js';
import { interactionSignal, rankPersonalized } from './recommendation-engine.js';

export interface RecommendationEvaluationMetrics {
  k: number;
  evaluatedUsers: number;
  skippedUsers: number;
  recallAtK: number;
  meanReciprocalRankAtK: number;
  normalizedDiscountedCumulativeGainAtK: number;
  catalogCoverageAtK: number;
}

function latestPositiveInteraction(snapshot: CatalogSnapshot, profile: UserProfile): ViewerInteraction | undefined {
  const movieIds = new Set(snapshot.movies.map((movie) => movie.movieId));

  return snapshot.interactions
    .filter(
      (interaction) =>
        interaction.userId === profile.userId &&
        movieIds.has(interaction.movieId) &&
        interactionSignal(interaction) >= 0.2
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
}

function hasTrainingPreference(snapshot: CatalogSnapshot, profile: UserProfile, holdout: ViewerInteraction): boolean {
  return snapshot.interactions.some(
    (interaction) =>
      interaction.userId === profile.userId &&
      interaction.movieId !== holdout.movieId &&
      interaction.startedAt < holdout.startedAt &&
      interactionSignal(interaction) >= 0.2
  );
}

export function evaluateRecommendationQuality(snapshot: CatalogSnapshot, k = 10): RecommendationEvaluationMetrics {
  if (!Number.isInteger(k) || k <= 0) throw new Error('Evaluation cutoff k must be a positive integer.');

  let evaluatedUsers = 0;
  let reciprocalRankTotal = 0;
  let discountedGainTotal = 0;
  let hits = 0;
  const recommendedMovieIds = new Set<string>();

  for (const profile of snapshot.users) {
    const holdout = latestPositiveInteraction(snapshot, profile);
    if (!holdout || !hasTrainingPreference(snapshot, profile, holdout)) continue;

    const trainingSnapshot: CatalogSnapshot = {
      ...snapshot,
      interactions: snapshot.interactions.filter(
        (interaction) =>
          interaction.userId !== profile.userId ||
          (interaction.movieId !== holdout.movieId && interaction.startedAt < holdout.startedAt)
      ),
    };
    const recommendations = rankPersonalized(trainingSnapshot, profile).ranked.slice(0, k);
    recommendations.forEach((item) => recommendedMovieIds.add(item.movie.movieId));

    const rank = recommendations.findIndex((item) => item.movie.movieId === holdout.movieId) + 1;
    if (rank > 0) {
      hits += 1;
      reciprocalRankTotal += 1 / rank;
      discountedGainTotal += 1 / Math.log2(rank + 1);
    }
    evaluatedUsers += 1;
  }

  const divisor = Math.max(1, evaluatedUsers);
  return {
    k,
    evaluatedUsers,
    skippedUsers: snapshot.users.length - evaluatedUsers,
    recallAtK: hits / divisor,
    meanReciprocalRankAtK: reciprocalRankTotal / divisor,
    normalizedDiscountedCumulativeGainAtK: discountedGainTotal / divisor,
    catalogCoverageAtK: recommendedMovieIds.size / Math.max(1, snapshot.movies.length),
  };
}
