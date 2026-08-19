import { describe, expect, it, vi } from 'vitest';
import { AiCurationService, type CurationCandidate, type CurationContext } from './ai-curation.js';

const candidate = (index: number): CurationCandidate => ({
  movieId: `MOV${String(index).padStart(4, '0')}`,
  title: `후보 영화 ${index}`,
  primaryGenre: index % 2 === 0 ? 'Drama' : 'Thriller',
  genreDetail: index % 2 === 0 ? '생활 드라마' : '심리 미스터리',
  setting: '서울',
  keywords: index % 2 === 0 ? '골목|이웃|회복' : '단서|추적|비밀',
  logline: `후보 영화 ${index}의 이야기`,
  runtimeMinutes: 90 + index,
  isPlatformOriginal: index % 3 === 0,
  matchScore: 90 - index,
  averageUserRating: 4.2,
  averageCriticScore: 82,
});

const context = (): CurationContext => ({
  userId: 'USR1',
  preferredGenre: 'Drama',
  watchTimePreference: 'late_night',
  preferredDevice: 'smart_tv',
  positiveHistory: [
    {
      title: '좋아한 영화',
      primaryGenre: 'Drama',
      genreDetail: '생활 드라마',
      setting: '서울',
      keywords: '골목|이웃|회복',
      preferenceSignal: 0.9,
    },
  ],
  candidates: Array.from({ length: 40 }, (_, index) => candidate(index + 1)),
});

const modelResponse = () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          themes: Array.from({ length: 4 }, (_, themeIndex) => ({
            title: `AI 추천 주제 ${themeIndex + 1}`,
            subtitle: `취향 근거를 반영한 컬렉션 ${themeIndex + 1}`,
            movieIds: Array.from(
              { length: 8 },
              (_, movieIndex) => `MOV${String(themeIndex * 8 + movieIndex + 1).padStart(4, '0')}`
            ),
          })),
        }),
      },
    },
  ],
});

describe('AiCurationService', () => {
  it('returns four validated, non-overlapping AI themes and caches them per user', async () => {
    const invoke = vi.fn().mockResolvedValue(modelResponse());
    const service = new AiCurationService(invoke);

    const first = await service.curate(context());
    const second = await service.curate(context());
    const changedContext = context();
    changedContext.candidates = [...changedContext.candidates].reverse();
    await service.curate(changedContext);
    const movieIds = first.themes.flatMap((theme) => theme.movieIds);

    expect(first.source).toBe('foundation-model');
    expect(first.themes).toHaveLength(4);
    expect(first.themes.every((theme) => theme.movieIds.length === 8)).toBe(true);
    expect(new Set(movieIds).size).toBe(movieIds.length);
    expect(second).toBe(first);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('falls back to four deterministic themes when model output is invalid', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new AiCurationService(vi.fn().mockResolvedValue({ choices: [] }));

    const result = await service.curate(context());

    expect(result.source).toBe('deterministic-fallback');
    expect(result.themes).toHaveLength(4);
    expect(result.themes[0]?.title).toContain('드라마');
    expect(result.themes.flatMap((theme) => theme.movieIds)).toHaveLength(32);
    warning.mockRestore();
  });
});
