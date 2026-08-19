import type {
  CatalogSnapshot,
  CriticCommentary,
  HomeFeed,
  Movie,
  MovieCard,
  MovieQualitySignal,
  RecommendationEvidence,
  UserProfile,
  ViewerInteraction,
} from '../shared/domain.js';
import { createFallbackCuration, type CurationContext, type ThemeCurationResult } from './ai-curation.js';
import type { RetrievedMovie } from './ai-search-retrieval.js';

interface PreferenceAnchor {
  movie: Movie;
  signal: number;
  interaction: ViewerInteraction;
}

interface RankedMovie {
  movie: Movie;
  score: number;
  positiveAnchor: PreferenceAnchor | null;
  sharedTokens: string[];
  retrievalRank?: number;
}

const stopWords = new Set(['그리고', '그러나', '대한', '통해', '위한', '속에서', '사이', '이야기', '영화']);

const genreLabels: Record<string, string> = {
  Action: '액션',
  Animation: '애니메이션',
  Comedy: '코미디',
  Documentary: '다큐멘터리',
  Drama: '드라마',
  Fantasy: '판타지',
  Horror: '공포',
  Romance: '로맨스',
  'Science Fiction': 'SF',
  Thriller: '스릴러',
};

const deviceLabels: Record<string, string> = {
  game_console: '게임 콘솔',
  headset: '헤드셋',
  mobile: '모바일',
  projector: '프로젝터',
  smart_tv: '스마트 TV',
  tablet: '태블릿',
  web: '웹',
};

const watchTimeLabels: Record<string, string> = {
  commute: '출퇴근 시간',
  late_night: '늦은 밤',
  weekday_evening: '평일 저녁',
  weekday_night: '평일 밤',
  weekend_afternoon: '주말 오후',
  weekend_morning: '주말 아침',
  weekend_night: '주말 밤',
};

function genreLabel(value: string): string {
  return genreLabels[value] ?? value;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function tokenize(movie: Movie): Set<string> {
  return new Set(
    [
      movie.primaryGenre,
      movie.genreDetail,
      movie.setting,
      movie.protagonist,
      movie.coreConflict,
      movie.keywords,
      movie.logline,
    ]
      .join(' ')
      .toLowerCase()
      .split(/[\s,;/|·:()[\]{}.!?"'’]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopWords.has(token))
  );
}

function explainableTokens(movie: Movie): Set<string> {
  return new Set(
    [movie.genreDetail, movie.setting, movie.protagonist, movie.coreConflict, movie.keywords]
      .join(' ')
      .toLowerCase()
      .split(/[\s,;/|·:()[\]{}.!?"'’]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopWords.has(token))
  );
}

function similarity(left: Movie, right: Movie): { score: number; shared: string[] } {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const leftEvidence = explainableTokens(left);
  const rightEvidence = explainableTokens(right);
  const shared = [...leftEvidence].filter((token) => rightEvidence.has(token));
  const denominator = Math.sqrt(leftTokens.size * rightTokens.size) || 1;

  return {
    score: shared.length / denominator,
    shared: shared.slice(0, 3),
  };
}

export function interactionSignal(interaction: ViewerInteraction): number {
  if (interaction.rating !== null) {
    return clamp((interaction.rating - 3) / 2, -1, 1);
  }

  const completionSignal = (interaction.completionPct - 55) / 45;
  const rewatchBonus = interaction.rewatchNumber > 0 ? 0.15 : 0;
  return clamp(completionSignal + rewatchBonus, -1, 1);
}

function latestInteractionPerMovie(interactions: ViewerInteraction[]): Map<string, ViewerInteraction> {
  const selected = new Map<string, ViewerInteraction>();

  for (const interaction of interactions) {
    const current = selected.get(interaction.movieId);
    if (!current) {
      selected.set(interaction.movieId, interaction);
      continue;
    }

    const candidateHasRating = interaction.rating !== null;
    const currentHasRating = current.rating !== null;
    if (candidateHasRating && !currentHasRating) {
      selected.set(interaction.movieId, interaction);
      continue;
    }

    if (candidateHasRating === currentHasRating && interaction.startedAt > current.startedAt) {
      selected.set(interaction.movieId, interaction);
    }
  }

  return selected;
}

function qualityScore(signal: MovieQualitySignal | undefined): number {
  if (!signal) return 0.45;
  const viewerRating = signal.averageUserRating === null ? 0.5 : signal.averageUserRating / 5;
  const criticRating = signal.averageCriticScore === null ? 0.5 : signal.averageCriticScore / 100;
  const completion = signal.averageCompletionPct / 100;
  return clamp(viewerRating * 0.45 + criticRating * 0.35 + completion * 0.2);
}

function findBestAnchor(
  candidate: Movie,
  anchors: PreferenceAnchor[]
): { anchor: PreferenceAnchor | null; score: number; shared: string[] } {
  let best: { anchor: PreferenceAnchor | null; score: number; shared: string[] } = {
    anchor: null,
    score: 0,
    shared: [],
  };

  for (const anchor of anchors) {
    const match = similarity(candidate, anchor.movie);
    const weighted = match.score * Math.max(0.2, Math.abs(anchor.signal));
    if (weighted > best.score) {
      best = { anchor, score: weighted, shared: match.shared };
    }
  }

  return best;
}

function evidenceFor(
  profile: UserProfile,
  ranked: RankedMovie,
  quality: MovieQualitySignal | undefined
): RecommendationEvidence[] {
  const anchorDetail = ranked.positiveAnchor
    ? `〈${ranked.positiveAnchor.movie.title}〉에서 확인된 선호와 연결`
    : `${genreLabel(profile.preferredGenre)} 선호 프로필과 연결`;
  const qualityDetail = quality?.averageCriticScore
    ? `평론가 평균 ${Math.round(quality.averageCriticScore)}점 · 완주율 ${Math.round(quality.averageCompletionPct)}%`
    : `시청자 평균 완주율 ${Math.round(quality?.averageCompletionPct ?? 0)}%`;

  return [
    { label: '취향 신호', detail: `${genreLabel(profile.preferredGenre)} · ${ranked.movie.genreDetail}` },
    { label: '시청 근거', detail: anchorDetail },
    ...(ranked.retrievalRank === undefined
      ? []
      : [{ label: 'AI Search', detail: `취향 문맥 Hybrid 검색 상위 ${ranked.retrievalRank}위` }]),
    { label: '작품 신뢰도', detail: qualityDetail },
  ];
}

function recommendationReason(profile: UserProfile, ranked: RankedMovie): string {
  if (ranked.positiveAnchor && ranked.sharedTokens.length > 0) {
    return `〈${ranked.positiveAnchor.movie.title}〉에서 좋아한 ${ranked.sharedTokens.join(' · ')} 감성을 이어가요.`;
  }

  if (ranked.movie.primaryGenre === profile.preferredGenre) {
    return `${genreLabel(profile.preferredGenre)} 취향과 잘 맞는 작품이에요.`;
  }

  return `${ranked.movie.genreDetail}의 분위기와 높은 작품 반응을 함께 반영했어요.`;
}

function matchScore(score: number): number {
  return Math.round(clamp(0.6 + score * 0.38) * 100);
}

function makeCard(
  profile: UserProfile,
  ranked: RankedMovie,
  quality: MovieQualitySignal | undefined,
  critic: CriticCommentary | undefined,
  progressPct?: number
): MovieCard {
  return {
    ...ranked.movie,
    matchScore: matchScore(ranked.score),
    reason: recommendationReason(profile, ranked),
    evidence: evidenceFor(profile, ranked, quality),
    averageUserRating: quality?.averageUserRating ?? null,
    averageCriticScore: quality?.averageCriticScore ?? null,
    criticHighlight: critic ?? null,
    ...(progressPct === undefined ? {} : { progressPct }),
  };
}

export function rankPersonalized(
  snapshot: CatalogSnapshot,
  profile: UserProfile
): {
  ranked: RankedMovie[];
  positiveAnchors: PreferenceAnchor[];
  negativeAnchors: PreferenceAnchor[];
  interactions: ViewerInteraction[];
} {
  const movieById = new Map(snapshot.movies.map((movie) => [movie.movieId, movie]));
  const interactions = snapshot.interactions.filter((interaction) => interaction.userId === profile.userId);
  const representative = latestInteractionPerMovie(interactions);
  const anchors = [...representative.values()]
    .map((interaction) => {
      const movie = movieById.get(interaction.movieId);
      return movie ? { movie, interaction, signal: interactionSignal(interaction) } : null;
    })
    .filter((anchor): anchor is PreferenceAnchor => anchor !== null);
  const positiveAnchors = anchors
    .filter((anchor) => anchor.signal >= 0.2)
    .sort((left, right) => right.signal - left.signal);
  const negativeAnchors = anchors
    .filter((anchor) => anchor.signal <= -0.2)
    .sort((left, right) => left.signal - right.signal);
  const positivePool = positiveAnchors.length > 0 ? positiveAnchors : anchors.slice(0, 3);
  const watchedIds = new Set(interactions.map((interaction) => interaction.movieId));
  const qualityById = new Map(snapshot.qualitySignals.map((signal) => [signal.movieId, signal]));
  const maxViewers = Math.max(1, ...snapshot.qualitySignals.map((signal) => signal.viewerCount));

  const ranked = snapshot.movies
    .filter((movie) => !watchedIds.has(movie.movieId))
    .map((movie): RankedMovie => {
      const positive = findBestAnchor(movie, positivePool);
      const negative = findBestAnchor(movie, negativeAnchors);
      const quality = qualityById.get(movie.movieId);
      const popularity = Math.log1p(quality?.viewerCount ?? 0) / Math.log1p(maxViewers);
      const preferredGenre = movie.primaryGenre === profile.preferredGenre ? 1 : 0;
      const score =
        positive.score * 0.43 -
        negative.score * 0.18 +
        preferredGenre * 0.18 +
        qualityScore(quality) * 0.13 +
        popularity * 0.05 +
        (movie.isPlatformOriginal ? 0.03 : 0);

      return {
        movie,
        score,
        positiveAnchor: positive.anchor,
        sharedTokens: positive.shared,
      };
    })
    .sort((left, right) => right.score - left.score || left.movie.movieId.localeCompare(right.movie.movieId));

  return { ranked, positiveAnchors, negativeAnchors, interactions };
}

function applyRetrievedRanking(
  ranking: ReturnType<typeof rankPersonalized>,
  retrievedMovies: RetrievedMovie[]
): ReturnType<typeof rankPersonalized> {
  if (retrievedMovies.length === 0) return ranking;

  const rankedById = new Map(ranking.ranked.map((item) => [item.movie.movieId, item]));
  const denominator = Math.max(1, retrievedMovies.length - 1);
  const ranked = retrievedMovies.flatMap((retrieved, index) => {
    const item = rankedById.get(retrieved.movieId);
    if (!item) return [];

    const retrievalStrength = 1 - (index / denominator) * 0.35;
    const deterministicStrength = clamp(0.5 + item.score);
    return [
      {
        ...item,
        score: retrievalStrength * 0.75 + deterministicStrength * 0.25,
        retrievalRank: retrieved.rank,
      },
    ];
  });

  return { ...ranking, ranked };
}

function curationContext(
  snapshot: CatalogSnapshot,
  profile: UserProfile,
  ranking: ReturnType<typeof rankPersonalized>
): CurationContext {
  const qualityById = new Map(snapshot.qualitySignals.map((signal) => [signal.movieId, signal]));

  return {
    userId: profile.userId,
    preferredGenre: profile.preferredGenre,
    watchTimePreference: profile.watchTimePreference,
    preferredDevice: profile.preferredDevice,
    positiveHistory: ranking.positiveAnchors.slice(0, 6).map((anchor) => ({
      title: anchor.movie.title,
      primaryGenre: anchor.movie.primaryGenre,
      genreDetail: anchor.movie.genreDetail,
      setting: anchor.movie.setting,
      keywords: anchor.movie.keywords,
      preferenceSignal: Number(anchor.signal.toFixed(2)),
    })),
    candidates: ranking.ranked.slice(0, 48).map((item) => {
      const quality = qualityById.get(item.movie.movieId);
      return {
        movieId: item.movie.movieId,
        title: item.movie.title,
        primaryGenre: item.movie.primaryGenre,
        genreDetail: item.movie.genreDetail,
        setting: item.movie.setting,
        keywords: item.movie.keywords,
        logline: item.movie.logline,
        runtimeMinutes: item.movie.runtimeMinutes,
        isPlatformOriginal: item.movie.isPlatformOriginal,
        matchScore: matchScore(item.score),
        averageUserRating: quality?.averageUserRating ?? null,
        averageCriticScore: quality?.averageCriticScore ?? null,
      };
    }),
  };
}

export function buildCurationContext(
  snapshot: CatalogSnapshot,
  userId: string,
  retrievedMovies: RetrievedMovie[] = []
): CurationContext {
  const profile = snapshot.users.find((user) => user.userId === userId);
  if (!profile) throw new Error(`Unknown user: ${userId}`);

  const ranking = applyRetrievedRanking(rankPersonalized(snapshot, profile), retrievedMovies);
  return curationContext(snapshot, profile, ranking);
}

export function buildHomeFeed(
  snapshot: CatalogSnapshot,
  userId: string,
  suppliedCuration?: ThemeCurationResult,
  retrievedMovies: RetrievedMovie[] = []
): HomeFeed {
  const profile = snapshot.users.find((user) => user.userId === userId);
  if (!profile) throw new Error(`Unknown user: ${userId}`);

  const ranking = applyRetrievedRanking(rankPersonalized(snapshot, profile), retrievedMovies);
  const { ranked, interactions } = ranking;
  if (ranked.length === 0) throw new Error('No unwatched movies are available to recommend.');

  const qualityById = new Map(snapshot.qualitySignals.map((signal) => [signal.movieId, signal]));
  const criticByMovie = new Map<string, CriticCommentary>();
  for (const critic of snapshot.criticCommentary) {
    if (!criticByMovie.has(critic.movieId)) criticByMovie.set(critic.movieId, critic);
  }

  const toCard = (item: RankedMovie, progressPct?: number) =>
    makeCard(profile, item, qualityById.get(item.movie.movieId), criticByMovie.get(item.movie.movieId), progressPct);

  const curation = suppliedCuration ?? createFallbackCuration(curationContext(snapshot, profile, ranking));
  const rankedById = new Map(ranked.map((item) => [item.movie.movieId, item]));
  const aiThemes = curation.themes
    .map((theme) => ({
      themeId: theme.themeId,
      title: theme.title,
      subtitle: theme.subtitle,
      movies: theme.movieIds.flatMap((movieId) => {
        const item = rankedById.get(movieId);
        return item ? [toCard(item)] : [];
      }),
    }))
    .filter((theme) => theme.movies.length > 0);

  const movieById = new Map(snapshot.movies.map((movie) => [movie.movieId, movie]));
  const partialByMovie = new Map<string, ViewerInteraction>();
  for (const interaction of interactions) {
    if (interaction.completionPct <= 4 || interaction.completionPct >= 95) continue;
    const current = partialByMovie.get(interaction.movieId);
    if (!current || interaction.startedAt > current.startedAt) {
      partialByMovie.set(interaction.movieId, interaction);
    }
  }
  const continueWatching = [...partialByMovie.values()]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 10)
    .flatMap((interaction) => {
      const movie = movieById.get(interaction.movieId);
      if (!movie) return [];
      return [
        toCard(
          {
            movie,
            score: interaction.completionPct / 100,
            positiveAnchor: null,
            sharedTokens: [],
          },
          interaction.completionPct
        ),
      ];
    });

  const trending = snapshot.movies
    .map(
      (movie): RankedMovie => ({
        movie,
        score:
          qualityScore(qualityById.get(movie.movieId)) * 0.75 +
          Math.log1p(qualityById.get(movie.movieId)?.viewerCount ?? 0) * 0.04,
        positiveAnchor: null,
        sharedTokens: [],
      })
    )
    .sort((left, right) => right.score - left.score || left.movie.movieId.localeCompare(right.movie.movieId))
    .slice(0, 12)
    .map((item) => toCard(item));

  const ratedTitles = new Set(
    interactions.filter((interaction) => interaction.rating !== null).map((item) => item.movieId)
  ).size;

  return {
    profile,
    hero: aiThemes[0]?.movies[0] ?? toCard(ranked[0]),
    rails: { aiThemes, continueWatching, trending },
    aiCuration: {
      source: curation.source,
      label:
        retrievedMovies.length > 0 && curation.source === 'foundation-model'
          ? 'Databricks RAG 추천'
          : retrievedMovies.length > 0
            ? 'Databricks AI Search 추천'
            : curation.source === 'ai-pending'
              ? 'Databricks RAG 추천 준비 중'
              : '취향 기반 큐레이션',
      themeCount: aiThemes.length,
      retrievalSource:
        retrievedMovies.length > 0
          ? 'ai-search'
          : curation.source === 'ai-pending'
            ? 'ai-pending'
            : 'deterministic-fallback',
      retrievedCandidateCount: retrievedMovies.length,
    },
    tasteSummary: {
      headline: `${genreLabel(profile.preferredGenre)}에서 시작해 새로운 결을 발견하는 취향`,
      details: `${watchTimeLabels[profile.watchTimePreference] ?? profile.watchTimePreference} 시청 패턴과 ${deviceLabels[profile.preferredDevice] ?? profile.preferredDevice} 이용 맥락을 반영했습니다.`,
      watchedTitles: new Set(interactions.map((item) => item.movieId)).size,
      ratedTitles,
    },
    generatedAt: new Date().toISOString(),
  };
}
