import type { CatalogSnapshot, MovieReviews, UserReview } from '../shared/domain.js';

export function buildMovieReviews(snapshot: CatalogSnapshot, movieId: string): MovieReviews {
  const criticReviews = snapshot.criticCommentary
    .filter((review) => review.movieId === movieId)
    .sort(
      (left, right) =>
        Number(right.isTopCritic) - Number(left.isTopCritic) ||
        Number(right.recommended) - Number(left.recommended) ||
        right.score100 - left.score100 ||
        right.reviewedAt.localeCompare(left.reviewedAt)
    );

  const profilesById = new Map(snapshot.users.map((profile) => [profile.userId, profile]));
  const reviewsById = new Map<string, UserReview>();

  for (const interaction of snapshot.interactions) {
    if (
      interaction.movieId !== movieId ||
      (!interaction.reviewTitle?.trim() && !interaction.reviewText?.trim()) ||
      !interaction.reviewedAt
    ) {
      continue;
    }

    reviewsById.set(interaction.viewingId, {
      reviewId: interaction.viewingId,
      displayName: profilesById.get(interaction.userId)?.displayName ?? 'SceneFlow 시청자',
      rating: interaction.rating,
      reviewTitle: interaction.reviewTitle,
      reviewText: interaction.reviewText,
      reviewedAt: interaction.reviewedAt,
    });
  }

  const userReviews = [...reviewsById.values()].sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));

  return { movieId, criticReviews, userReviews };
}
