import type { CatalogSnapshot } from '../shared/domain.js';
import type { CurationContext, ThemeCurationResult } from './ai-curation.js';
import type { RecommendationRetrieval } from './ai-search-retrieval.js';
import { buildCurationContext } from './recommendation-engine.js';

const RAG_CACHE_TTL_MS = 30 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 2 * 60 * 1000;

export interface RagRecommendationResult {
  curation: ThemeCurationResult;
  retrieval: RecommendationRetrieval;
}

export type RetrieveRecommendations = (
  context: CurationContext,
  validMovieIds: ReadonlySet<string>,
  excludedMovieIds: ReadonlySet<string>
) => Promise<RecommendationRetrieval>;

export type CurateRecommendations = (context: CurationContext) => Promise<ThemeCurationResult>;
export type RagRecommendationObserver = (
  operation: () => Promise<RagRecommendationResult>
) => Promise<RagRecommendationResult>;

export class RagRecommendationService {
  private readonly cache = new Map<string, { expiresAt: number; result: RagRecommendationResult }>();
  private readonly pending = new Map<string, Promise<RagRecommendationResult>>();

  constructor(
    private readonly retrieve: RetrieveRecommendations,
    private readonly curate: CurateRecommendations,
    private readonly now: () => number = Date.now,
    private readonly observe: RagRecommendationObserver = (operation) => operation()
  ) {}

  getCached(userId: string): RagRecommendationResult | null {
    const cached = this.cache.get(userId);
    if (!cached) return null;
    if (cached.expiresAt <= this.now()) {
      this.cache.delete(userId);
      return null;
    }
    return cached.result;
  }

  async recommend(snapshot: CatalogSnapshot, userId: string): Promise<RagRecommendationResult> {
    const cached = this.getCached(userId);
    if (cached) return cached;

    const active = this.pending.get(userId);
    if (active) return active;

    const request = this.observe(() => this.generate(snapshot, userId));
    this.pending.set(userId, request);
    try {
      const result = await request;
      const isFullRag = result.retrieval.source === 'ai-search' && result.curation.source === 'foundation-model';
      this.cache.set(userId, {
        expiresAt: this.now() + (isFullRag ? RAG_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS),
        result,
      });
      return result;
    } finally {
      this.pending.delete(userId);
    }
  }

  private async generate(snapshot: CatalogSnapshot, userId: string): Promise<RagRecommendationResult> {
    const baseContext = buildCurationContext(snapshot, userId);
    const validMovieIds = new Set(snapshot.movies.map((movie) => movie.movieId));
    const excludedMovieIds = new Set(
      snapshot.interactions
        .filter((interaction) => interaction.userId === userId)
        .map((interaction) => interaction.movieId)
    );

    let retrieval: RecommendationRetrieval;
    try {
      retrieval = await this.retrieve(baseContext, validMovieIds, excludedMovieIds);
    } catch (error) {
      console.warn('AI Search retrieval failed; using deterministic candidates.', error);
      retrieval = { source: 'deterministic-fallback', movies: [] };
    }

    const groundedContext = buildCurationContext(snapshot, userId, retrieval.movies);
    const curation = await this.curate(groundedContext);
    return { curation, retrieval };
  }
}
