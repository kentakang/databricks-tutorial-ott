import { z } from 'zod';

const THEME_COUNT = 4;
const MOVIES_PER_THEME = 8;
const AI_CACHE_TTL_MS = 30 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 2 * 60 * 1000;

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

export interface CurationCandidate {
  movieId: string;
  title: string;
  primaryGenre: string;
  genreDetail: string;
  setting: string;
  keywords: string;
  logline: string;
  runtimeMinutes: number;
  isPlatformOriginal: boolean;
  matchScore: number;
  averageUserRating: number | null;
  averageCriticScore: number | null;
}

export interface CurationHistoryItem {
  title: string;
  primaryGenre: string;
  genreDetail: string;
  setting: string;
  keywords: string;
  preferenceSignal: number;
}

export interface CurationContext {
  userId: string;
  preferredGenre: string;
  watchTimePreference: string;
  preferredDevice: string;
  positiveHistory: CurationHistoryItem[];
  candidates: CurationCandidate[];
}

export interface CuratedTheme {
  themeId: string;
  title: string;
  subtitle: string;
  movieIds: string[];
}

export interface ThemeCurationResult {
  source: 'foundation-model' | 'deterministic-fallback' | 'ai-pending';
  themes: CuratedTheme[];
}

export interface ThemeModelRequest {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxTokens: number;
  temperature: number;
}

export type ThemeModelInvoker = (request: ThemeModelRequest) => Promise<unknown>;

const modelThemeSchema = z.object({
  title: z.string().trim().min(2).max(40),
  subtitle: z.string().trim().min(4).max(100),
  movieIds: z.array(z.string().trim()).min(1).max(12),
});

const modelResponseSchema = z.object({
  themes: z.array(modelThemeSchema).length(THEME_COUNT),
});

function modelText(response: unknown): string {
  if (typeof response !== 'object' || response === null) throw new Error('Model response was not an object.');
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error('Model response did not contain choices.');

  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) throw new Error('Model response did not contain a message.');
  const content = (message as { content?: unknown }).content;

  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .flatMap((item) =>
        typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'text'
          ? [(item as { text?: unknown }).text]
          : []
      )
      .filter((item): item is string => typeof item === 'string')
      .join('\n');
  }

  throw new Error('Model response content was not text.');
}

function parseJsonObject(content: string): unknown {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model response did not contain JSON.');
  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}

function selectUnique(
  candidates: CurationCandidate[],
  usedMovieIds: Set<string>,
  preferredMovieIds: string[] = []
): string[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.movieId));
  const selected: string[] = [];

  for (const movieId of preferredMovieIds) {
    if (!candidateIds.has(movieId) || usedMovieIds.has(movieId) || selected.includes(movieId)) continue;
    selected.push(movieId);
    usedMovieIds.add(movieId);
    if (selected.length === MOVIES_PER_THEME) return selected;
  }

  for (const candidate of candidates) {
    if (usedMovieIds.has(candidate.movieId)) continue;
    selected.push(candidate.movieId);
    usedMovieIds.add(candidate.movieId);
    if (selected.length === MOVIES_PER_THEME) break;
  }

  return selected;
}

function normalizeModelThemes(response: unknown, context: CurationContext): CuratedTheme[] {
  const parsed = modelResponseSchema.parse(parseJsonObject(modelText(response)));
  const usedMovieIds = new Set<string>();
  const themes = parsed.themes.map((theme, index) => ({
    themeId: `ai-theme-${index + 1}`,
    title: theme.title,
    subtitle: theme.subtitle,
    movieIds: selectUnique(context.candidates, usedMovieIds, theme.movieIds),
  }));

  if (themes.some((theme) => theme.movieIds.length < 4)) {
    throw new Error('Model response did not produce enough valid movie recommendations.');
  }

  return themes;
}

function fallbackPools(context: CurationContext): CurationCandidate[][] {
  const anchor = context.positiveHistory[0];
  const anchorTokens = new Set((anchor?.keywords ?? '').toLowerCase().split(/[\s,;/|·]+/u));
  const preferredGenre = context.candidates.filter((movie) => movie.primaryGenre === context.preferredGenre);
  const anchorMood = context.candidates.filter((movie) =>
    movie.keywords
      .toLowerCase()
      .split(/[\s,;/|·]+/u)
      .some((token) => anchorTokens.has(token))
  );
  const originals = context.candidates.filter((movie) => movie.isPlatformOriginal);
  const acclaimed = [...context.candidates].sort(
    (left, right) =>
      (right.averageCriticScore ?? 0) - (left.averageCriticScore ?? 0) ||
      (right.averageUserRating ?? 0) - (left.averageUserRating ?? 0) ||
      right.matchScore - left.matchScore
  );

  return [preferredGenre, anchorMood, originals, acclaimed];
}

export function createFallbackCuration(context: CurationContext): ThemeCurationResult {
  const anchorTitle = context.positiveHistory[0]?.title;
  const titles = [
    `${genreLabels[context.preferredGenre] ?? context.preferredGenre} 취향 정주행`,
    anchorTitle ? `〈${anchorTitle}〉의 여운을 이어서` : '최근 취향과 닮은 이야기',
    'SceneFlow 오리지널 발견',
    '평론가와 시청자가 함께 주목한 작품',
  ];
  const subtitles = [
    '선호 장르와 시청 반응을 함께 반영한 추천',
    '좋아한 작품의 소재와 분위기를 연결한 컬렉션',
    '지금 발견하기 좋은 SceneFlow 독점 이야기',
    '완주율과 작품 평가가 모두 좋은 큐레이션',
  ];
  const usedMovieIds = new Set<string>();
  const pools = fallbackPools(context);
  const themes = pools.map((pool, index) => ({
    themeId: `taste-theme-${index + 1}`,
    title: titles[index] ?? `취향 추천 ${index + 1}`,
    subtitle: subtitles[index] ?? '시청 취향을 반영한 추천',
    movieIds: selectUnique([...pool, ...context.candidates], usedMovieIds),
  }));

  return { source: 'deterministic-fallback', themes: themes.filter((theme) => theme.movieIds.length > 0) };
}

function buildModelRequest(context: CurationContext): ThemeModelRequest {
  const input = {
    viewerTaste: {
      preferredGenre: context.preferredGenre,
      watchTimePreference: context.watchTimePreference,
      preferredDevice: context.preferredDevice,
    },
    positiveHistory: context.positiveHistory,
    candidateMovies: context.candidates,
  };

  return {
    messages: [
      {
        role: 'system',
        content:
          '당신은 한국 OTT 서비스의 개인화 편성 AI입니다. 제공된 합성 시청 취향과 후보 영화만 사용해 서로 겹치지 않는 추천 주제를 만드세요. 반드시 유효한 JSON만 출력하고 설명이나 마크다운을 추가하지 마세요.',
      },
      {
        role: 'user',
        content: [
          '아래 데이터로 서로 다른 관점의 개인화 추천 주제 4개를 만드세요.',
          '- 각 title은 실제 OTT 홈에 어울리는 자연스러운 한국어로 24자 이내',
          '- 각 subtitle은 이 사용자에게 추천하는 근거를 60자 이내로 설명',
          '- 각 주제에 candidateMovies의 movieId만 정확히 8개 선택',
          '- 이미 다른 주제에서 선택한 영화는 다시 선택하지 않기',
          '- 장르뿐 아니라 좋아한 작품의 배경, 소재, 갈등, 시청 시간대도 다양하게 활용',
          '- 출력 형식: {"themes":[{"title":"...","subtitle":"...","movieIds":["MOV0001"]}]}',
          `DATA=${JSON.stringify(input)}`,
        ].join('\n'),
      },
    ],
    maxTokens: 900,
    temperature: 0.35,
  };
}

export class AiCurationService {
  private readonly cache = new Map<string, { expiresAt: number; result: ThemeCurationResult }>();
  private readonly pending = new Map<string, Promise<ThemeCurationResult>>();

  constructor(
    private readonly invokeModel: ThemeModelInvoker,
    private readonly now: () => number = Date.now
  ) {}

  getCached(userId: string): ThemeCurationResult | null {
    const cached = this.cache.get(userId);
    if (!cached) return null;
    if (cached.expiresAt <= this.now()) {
      this.cache.delete(userId);
      return null;
    }
    return cached.result;
  }

  async curate(context: CurationContext): Promise<ThemeCurationResult> {
    const cached = this.getCached(context.userId);
    if (cached) return cached;

    const active = this.pending.get(context.userId);
    if (active) return active;

    const request = this.generate(context);
    this.pending.set(context.userId, request);
    try {
      const result = await request;
      const ttl = result.source === 'foundation-model' ? AI_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS;
      this.cache.set(context.userId, { expiresAt: this.now() + ttl, result });
      return result;
    } finally {
      this.pending.delete(context.userId);
    }
  }

  private async generate(context: CurationContext): Promise<ThemeCurationResult> {
    try {
      const response = await this.invokeModel(buildModelRequest(context));
      return { source: 'foundation-model', themes: normalizeModelThemes(response, context) };
    } catch (error) {
      console.warn('AI theme generation failed; using deterministic fallback.', error);
      return createFallbackCuration(context);
    }
  }
}
