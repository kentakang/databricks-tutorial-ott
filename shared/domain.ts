export interface UserProfile {
  userId: string;
  displayName: string;
  birthYear: number;
  preferredLanguage: string;
  subscriptionPlan: string;
  preferredGenre: string;
  preferredDevice: string;
  watchTimePreference: string;
  householdType: string;
}

export interface Movie {
  movieId: string;
  title: string;
  releaseDate: string;
  primaryGenre: string;
  genreDetail: string;
  productionCountry: string;
  originalLanguage: string;
  runtimeMinutes: number;
  contentRating: string;
  directorName: string;
  studioName: string;
  theatricalAdmissions: number;
  platformReleaseDate: string;
  isPlatformOriginal: boolean;
  setting: string;
  protagonist: string;
  coreConflict: string;
  keywords: string;
  logline: string;
}

export interface ViewerInteraction {
  viewingId: string;
  userId: string;
  movieId: string;
  startedAt: string;
  endedAt: string | null;
  watchMinutes: number;
  completionPct: number;
  playbackStatus: string;
  deviceType: string;
  streamingQuality: string;
  rewatchNumber: number;
  discoverySource: string;
  rating: number | null;
  reviewTitle: string | null;
  reviewText: string | null;
  reviewedAt: string | null;
}

export interface MovieQualitySignal {
  movieId: string;
  viewCount: number;
  viewerCount: number;
  averageCompletionPct: number;
  completedRate: number;
  rewatchRate: number;
  userReviewCount: number;
  averageUserRating: number | null;
  criticReviewCount: number;
  averageCriticScore: number | null;
  criticRecommendationRate: number;
}

export interface CriticCommentary {
  criticReviewId: string;
  movieId: string;
  score100: number;
  letterGrade: string;
  reviewTitle: string;
  reviewText: string;
  reviewedAt: string;
  verdict: string;
  recommended: boolean;
  criticName: string;
  penName: string;
  publicationName: string;
  yearsExperience: number;
  specialtyGenre: string;
  isTopCritic: boolean;
}

export interface CatalogSnapshot {
  users: UserProfile[];
  movies: Movie[];
  interactions: ViewerInteraction[];
  qualitySignals: MovieQualitySignal[];
  criticCommentary: CriticCommentary[];
}

export interface RecommendationEvidence {
  label: string;
  detail: string;
}

export interface MovieCard extends Movie {
  matchScore: number;
  reason: string;
  evidence: RecommendationEvidence[];
  averageUserRating: number | null;
  averageCriticScore: number | null;
  criticHighlight: CriticCommentary | null;
  progressPct?: number;
}

export interface HomeFeed {
  profile: UserProfile;
  hero: MovieCard;
  rails: {
    personalized: MovieCard[];
    inspiredBy: {
      title: string;
      anchorTitle: string;
      movies: MovieCard[];
    } | null;
    continueWatching: MovieCard[];
    trending: MovieCard[];
  };
  tasteSummary: {
    headline: string;
    details: string;
    watchedTitles: number;
    ratedTitles: number;
  };
  generatedAt: string;
}
