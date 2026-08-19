import type { CurationContext } from './ai-curation.js';

export const AI_SEARCH_RESULT_COUNT = 64;
export const MINIMUM_RAG_CANDIDATES = 32;

export interface AiSearchRequest {
  columns: string[];
  numResults: number;
  queryText: string;
  queryType: 'hybrid';
}

export interface RetrievedMovie {
  movieId: string;
  rank: number;
  score: number | null;
}

export interface RecommendationRetrieval {
  source: 'ai-search' | 'deterministic-fallback';
  movies: RetrievedMovie[];
}

export type AiSearchInvoker = (request: AiSearchRequest) => Promise<unknown>;

interface SearchResponse {
  results?: unknown;
}

function optionalScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildAiSearchQuery(context: CurationContext): string {
  const positiveHistory = context.positiveHistory
    .slice(0, 6)
    .map((item) => `${item.title} (${item.primaryGenre}, ${item.genreDetail}, ${item.setting}, ${item.keywords})`)
    .join('; ');

  return [
    `선호 장르: ${context.preferredGenre}`,
    `주 시청 시간대: ${context.watchTimePreference}`,
    `선호 기기: ${context.preferredDevice}`,
    positiveHistory ? `좋아한 작품과 취향 단서: ${positiveHistory}` : '좋아한 작품: 아직 충분한 이력 없음',
    '이 취향과 의미, 분위기, 소재가 잘 맞는 영화를 추천',
  ].join('\n');
}

export function parseAiSearchResponse(
  response: unknown,
  validMovieIds: ReadonlySet<string>,
  excludedMovieIds: ReadonlySet<string>
): RetrievedMovie[] {
  if (typeof response !== 'object' || response === null) {
    throw new Error('AI Search response was not an object.');
  }

  const typed = response as SearchResponse;
  if (!Array.isArray(typed.results)) {
    throw new Error('AI Search response did not contain a valid results array.');
  }
  const seen = new Set<string>();

  return typed.results.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const data = (item as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null) return [];

    const movieId = (data as { movie_id?: unknown }).movie_id;
    if (
      typeof movieId !== 'string' ||
      !validMovieIds.has(movieId) ||
      excludedMovieIds.has(movieId) ||
      seen.has(movieId)
    ) {
      return [];
    }

    seen.add(movieId);
    return [
      {
        movieId,
        rank: seen.size,
        score: optionalScore((item as { score?: unknown }).score),
      },
    ];
  });
}

export class AiSearchRecommendationRetriever {
  constructor(private readonly invokeSearch: AiSearchInvoker) {}

  async retrieve(
    context: CurationContext,
    validMovieIds: ReadonlySet<string>,
    excludedMovieIds: ReadonlySet<string>
  ): Promise<RecommendationRetrieval> {
    const response = await this.invokeSearch({
      columns: ['movie_id'],
      numResults: AI_SEARCH_RESULT_COUNT,
      queryText: buildAiSearchQuery(context),
      queryType: 'hybrid',
    });
    const movies = parseAiSearchResponse(response, validMovieIds, excludedMovieIds);
    if (movies.length < MINIMUM_RAG_CANDIDATES) {
      throw new Error(
        `AI Search returned ${movies.length} eligible movies; at least ${MINIMUM_RAG_CANDIDATES} are required.`
      );
    }

    return { source: 'ai-search', movies };
  }
}
