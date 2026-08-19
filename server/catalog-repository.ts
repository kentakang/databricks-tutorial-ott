import type {
  CatalogSnapshot,
  CriticCommentary,
  Movie,
  MovieQualitySignal,
  UserProfile,
  ViewerInteraction,
} from '../shared/domain.js';
import { getDataNamespace, qualifiedName, type DataNamespace } from './config.js';

interface QueryResult {
  data?: Array<Record<string, string | null>>;
  data_array?: Array<Array<string | null>>;
}

export type AnalyticsQuery = (statement: string) => Promise<unknown>;

const CACHE_TTL_MS = 5 * 60 * 1000;

function rows(result: unknown): Array<Array<string | null>> {
  const typed = result as QueryResult;
  if (typed && Array.isArray(typed.data_array)) {
    return typed.data_array;
  }
  if (typed && Array.isArray(typed.data)) {
    return typed.data.map((row) => Object.values(row));
  }

  throw new Error('Databricks SQL returned an unexpected result shape.');
}

function text(value: string | null, column: string): string {
  if (value === null) throw new Error(`Required column ${column} was null.`);
  return value;
}

function integer(value: string | null, column: string): number {
  const parsed = Number.parseInt(text(value, column), 10);
  if (!Number.isFinite(parsed)) throw new Error(`Column ${column} was not an integer.`);
  return parsed;
}

function decimal(value: string | null, column: string): number {
  const parsed = Number.parseFloat(text(value, column));
  if (!Number.isFinite(parsed)) throw new Error(`Column ${column} was not numeric.`);
  return parsed;
}

function optionalDecimal(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value: string | null): boolean {
  return value?.toLowerCase() === 'true';
}

export class CatalogRepository {
  private cachedSnapshot: { expiresAt: number; value: CatalogSnapshot } | null = null;
  private pendingSnapshot: Promise<CatalogSnapshot> | null = null;

  constructor(
    private readonly query: AnalyticsQuery,
    private readonly namespace: DataNamespace = getDataNamespace()
  ) {}

  async getSnapshot(): Promise<CatalogSnapshot> {
    if (this.cachedSnapshot && this.cachedSnapshot.expiresAt > Date.now()) {
      return this.cachedSnapshot.value;
    }

    if (this.pendingSnapshot) return this.pendingSnapshot;

    this.pendingSnapshot = this.loadSnapshot();
    try {
      const value = await this.pendingSnapshot;
      this.cachedSnapshot = { expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    } finally {
      this.pendingSnapshot = null;
    }
  }

  private async loadSnapshot(): Promise<CatalogSnapshot> {
    const [users, movies, interactions, qualitySignals, criticCommentary] = await Promise.all([
      this.loadUsers(),
      this.loadMovies(),
      this.loadInteractions(),
      this.loadQualitySignals(),
      this.loadCriticCommentary(),
    ]);

    return { users, movies, interactions, qualitySignals, criticCommentary };
  }

  private async loadUsers(): Promise<UserProfile[]> {
    const result = await this.query(`
      SELECT
        user_id, display_name, birth_year, preferred_language,
        subscription_plan, preferred_genre, preferred_device,
        watch_time_preference, household_type
      FROM ${qualifiedName(this.namespace, 'consumer_profiles')}
      ORDER BY display_name, user_id
    `);

    return rows(result).map((row) => ({
      userId: text(row[0] ?? null, 'user_id'),
      displayName: text(row[1] ?? null, 'display_name'),
      birthYear: integer(row[2] ?? null, 'birth_year'),
      preferredLanguage: text(row[3] ?? null, 'preferred_language'),
      subscriptionPlan: text(row[4] ?? null, 'subscription_plan'),
      preferredGenre: text(row[5] ?? null, 'preferred_genre'),
      preferredDevice: text(row[6] ?? null, 'preferred_device'),
      watchTimePreference: text(row[7] ?? null, 'watch_time_preference'),
      householdType: text(row[8] ?? null, 'household_type'),
    }));
  }

  private async loadMovies(): Promise<Movie[]> {
    const result = await this.query(`
      SELECT
        movie_id, title, CAST(release_date AS STRING), primary_genre,
        genre_detail, production_country, original_language, runtime_minutes,
        content_rating, director_name, studio_name, theatrical_admissions,
        CAST(platform_release_date AS STRING), is_platform_original,
        setting, protagonist, core_conflict, keywords, logline
      FROM ${qualifiedName(this.namespace, 'movies')}
      ORDER BY movie_id
    `);

    return rows(result).map((row) => ({
      movieId: text(row[0] ?? null, 'movie_id'),
      title: text(row[1] ?? null, 'title'),
      releaseDate: text(row[2] ?? null, 'release_date'),
      primaryGenre: text(row[3] ?? null, 'primary_genre'),
      genreDetail: text(row[4] ?? null, 'genre_detail'),
      productionCountry: text(row[5] ?? null, 'production_country'),
      originalLanguage: text(row[6] ?? null, 'original_language'),
      runtimeMinutes: integer(row[7] ?? null, 'runtime_minutes'),
      contentRating: text(row[8] ?? null, 'content_rating'),
      directorName: text(row[9] ?? null, 'director_name'),
      studioName: text(row[10] ?? null, 'studio_name'),
      theatricalAdmissions: integer(row[11] ?? null, 'theatrical_admissions'),
      platformReleaseDate: text(row[12] ?? null, 'platform_release_date'),
      isPlatformOriginal: boolean(row[13] ?? null),
      setting: text(row[14] ?? null, 'setting'),
      protagonist: text(row[15] ?? null, 'protagonist'),
      coreConflict: text(row[16] ?? null, 'core_conflict'),
      keywords: text(row[17] ?? null, 'keywords'),
      logline: text(row[18] ?? null, 'logline'),
    }));
  }

  private async loadInteractions(): Promise<ViewerInteraction[]> {
    const result = await this.query(`
      SELECT
        viewing_id, user_id, movie_id, CAST(started_at AS STRING),
        CAST(ended_at AS STRING), watch_minutes, completion_pct,
        playback_status, device_type, streaming_quality, rewatch_number,
        discovery_source, rating, review_title, review_text,
        CAST(reviewed_at AS STRING)
      FROM ${qualifiedName(this.namespace, 'viewer_interactions')}
      ORDER BY started_at DESC, viewing_id
    `);

    return rows(result).map((row) => ({
      viewingId: text(row[0] ?? null, 'viewing_id'),
      userId: text(row[1] ?? null, 'user_id'),
      movieId: text(row[2] ?? null, 'movie_id'),
      startedAt: text(row[3] ?? null, 'started_at'),
      endedAt: row[4] ?? null,
      watchMinutes: integer(row[5] ?? null, 'watch_minutes'),
      completionPct: integer(row[6] ?? null, 'completion_pct'),
      playbackStatus: text(row[7] ?? null, 'playback_status'),
      deviceType: text(row[8] ?? null, 'device_type'),
      streamingQuality: text(row[9] ?? null, 'streaming_quality'),
      rewatchNumber: integer(row[10] ?? null, 'rewatch_number'),
      discoverySource: text(row[11] ?? null, 'discovery_source'),
      rating: optionalDecimal(row[12] ?? null),
      reviewTitle: row[13] ?? null,
      reviewText: row[14] ?? null,
      reviewedAt: row[15] ?? null,
    }));
  }

  private async loadQualitySignals(): Promise<MovieQualitySignal[]> {
    const result = await this.query(`
      SELECT
        movie_id, view_count, viewer_count, average_completion_pct,
        completed_rate, rewatch_rate, user_review_count, average_user_rating,
        critic_review_count, average_critic_score, critic_recommendation_rate
      FROM ${qualifiedName(this.namespace, 'movie_quality_signals')}
      ORDER BY movie_id
    `);

    return rows(result).map((row) => ({
      movieId: text(row[0] ?? null, 'movie_id'),
      viewCount: integer(row[1] ?? null, 'view_count'),
      viewerCount: integer(row[2] ?? null, 'viewer_count'),
      averageCompletionPct: decimal(row[3] ?? null, 'average_completion_pct'),
      completedRate: decimal(row[4] ?? null, 'completed_rate'),
      rewatchRate: decimal(row[5] ?? null, 'rewatch_rate'),
      userReviewCount: integer(row[6] ?? null, 'user_review_count'),
      averageUserRating: optionalDecimal(row[7] ?? null),
      criticReviewCount: integer(row[8] ?? null, 'critic_review_count'),
      averageCriticScore: optionalDecimal(row[9] ?? null),
      criticRecommendationRate: decimal(row[10] ?? null, 'critic_recommendation_rate'),
    }));
  }

  private async loadCriticCommentary(): Promise<CriticCommentary[]> {
    const result = await this.query(`
      SELECT
        critic_review_id, movie_id, score_100, letter_grade, review_title,
        review_text, CAST(reviewed_at AS STRING), verdict, recommended,
        critic_name, pen_name, publication_name, years_experience,
        specialty_genre, is_top_critic
      FROM ${qualifiedName(this.namespace, 'critic_commentary')}
      ORDER BY is_top_critic DESC, score_100 DESC, reviewed_at DESC
    `);

    return rows(result).map((row) => ({
      criticReviewId: text(row[0] ?? null, 'critic_review_id'),
      movieId: text(row[1] ?? null, 'movie_id'),
      score100: integer(row[2] ?? null, 'score_100'),
      letterGrade: text(row[3] ?? null, 'letter_grade'),
      reviewTitle: text(row[4] ?? null, 'review_title'),
      reviewText: text(row[5] ?? null, 'review_text'),
      reviewedAt: text(row[6] ?? null, 'reviewed_at'),
      verdict: text(row[7] ?? null, 'verdict'),
      recommended: boolean(row[8] ?? null),
      criticName: text(row[9] ?? null, 'critic_name'),
      penName: text(row[10] ?? null, 'pen_name'),
      publicationName: text(row[11] ?? null, 'publication_name'),
      yearsExperience: integer(row[12] ?? null, 'years_experience'),
      specialtyGenre: text(row[13] ?? null, 'specialty_genre'),
      isTopCritic: boolean(row[14] ?? null),
    }));
  }
}
