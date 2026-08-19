import type { CSSProperties } from 'react';
import type { MovieCard } from '../../../shared/domain.js';

export interface UserSummary {
  userId: string;
  displayName: string;
  preferredGenre: string;
  subscriptionPlan: string;
}

export function formatPlan(plan: string): string {
  const normalized = plan.toLowerCase();
  if (normalized.includes('premium')) return '프리미엄 4K';
  if (normalized.includes('standard')) return '스탠다드 FHD';
  if (normalized.includes('basic')) return '베이직 HD';
  return plan;
}

export function formatGenre(genre: string): string {
  const labels: Record<string, string> = {
    Action: '액션',
    Animation: '애니메이션',
    Comedy: '코미디',
    Documentary: '다큐멘터리',
    Drama: '드라마',
    Fantasy: '판타지',
    Horror: '공포/스릴러',
    Romance: '로맨스/멜로',
    'Science Fiction': 'SF/SF판타지',
    Thriller: '스릴러/미스터리',
  };
  return labels[genre] ?? genre;
}

export function scoreLabel(movie: MovieCard): string {
  if (movie.averageCriticScore !== null) {
    return `평론가 ${Math.round(movie.averageCriticScore)}점`;
  }
  if (movie.averageUserRating !== null) {
    return `★ ${movie.averageUserRating.toFixed(1)}`;
  }
  return 'AI 추천작';
}

export function formatReviewDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

// Generate aesthetic Korean OTT visual color themes based on genre and movie ID
export function artStyle(movie: MovieCard): CSSProperties {
  const genreHueMap: Record<string, [number, number]> = {
    Action: [10, 38], // Fiery Red & Amber
    'Science Fiction': [210, 260], // Cyber Blue & Deep Purple
    Drama: [280, 330], // Rich Violet & Magenta
    Thriller: [170, 220], // Deep Teal & Indigo
    Romance: [340, 25], // Rose & Warm Coral
    Animation: [45, 180], // Vibrant Gold & Emerald
    Comedy: [35, 65], // Bright Tangerine & Yellow
    Horror: [0, 270], // Crimson & Midnight
    Fantasy: [240, 290], // Mystic Indigo & Violet
    Documentary: [195, 230], // Slate Blue & Ocean
  };

  const baseHues = genreHueMap[movie.primaryGenre] || [240, 280];
  const seed = [...`${movie.primaryGenre}${movie.movieId}`].reduce(
    (total, character) => total + (character.codePointAt(0) ?? 0),
    0
  );

  const hue1 = (baseHues[0] + (seed % 30) - 15 + 360) % 360;
  const hue2 = (baseHues[1] + ((seed * 7) % 40) - 20 + 360) % 360;

  return {
    '--art-hue': `${hue1}`,
    '--art-hue-alt': `${hue2}`,
  } as CSSProperties;
}

export function parseRating(rating?: string): { code: 'ALL' | '12' | '15' | '19'; label: string; fullLabel: string } {
  if (!rating) return { code: '15', label: '15', fullLabel: '15세 이상 관람가' };

  const raw = rating.toLowerCase();
  if (raw.includes('all') || raw.includes('전체') || raw === 'g') {
    return { code: 'ALL', label: 'ALL', fullLabel: '전체 관람가' };
  }
  if (raw.includes('12') || raw.includes('pg-13') || raw.includes('pg13')) {
    return { code: '12', label: '12', fullLabel: '12세 이상 관람가' };
  }
  if (
    raw.includes('18') ||
    raw.includes('19') ||
    raw.includes('청불') ||
    raw.includes('청소년') ||
    raw.includes('r') ||
    raw.includes('nc-17')
  ) {
    return { code: '19', label: '19', fullLabel: '청소년 관람불가' };
  }
  return { code: '15', label: '15', fullLabel: '15세 이상 관람가' };
}
