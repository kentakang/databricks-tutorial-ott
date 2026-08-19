import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useRef } from 'react';
import type { MovieCard as MovieCardType } from '../../../shared/domain.js';
import { MovieCard } from './MovieCard.js';

interface MovieRailProps {
  id: string;
  title: string;
  subtitle?: string;
  movies: MovieCardType[];
  onSelect: (movie: MovieCardType) => void;
  onPlay: (movie: MovieCardType) => void;
  wishlistIds: Set<string>;
  onToggleWishlist: (movie: MovieCardType) => void;
  showMatch?: boolean;
  showProgress?: boolean;
  numbered?: boolean;
  badge?: string;
  aspectRatio?: 'poster' | 'landscape';
}

export function MovieRail({
  id,
  title,
  subtitle,
  movies,
  onSelect,
  onPlay,
  wishlistIds,
  onToggleWishlist,
  showMatch = false,
  showProgress = false,
  numbered = false,
  badge,
  aspectRatio = 'poster',
}: MovieRailProps) {
  const railRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: number) => {
    if (railRef.current) {
      const scrollAmount = railRef.current.clientWidth * 0.75 * direction;
      railRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id={id} className="ott-rail-section" aria-label={title}>
      {/* Rail Header */}
      <div className="rail-header">
        <div className="rail-title-group">
          <div className="rail-badge-line">
            {badge && (
              <span className="rail-tag-badge">
                <Sparkles size={11} /> {badge}
              </span>
            )}
            <h2 className="rail-main-title">{title}</h2>
          </div>
          {subtitle && <p className="rail-subtitle">{subtitle}</p>}
        </div>

        {/* Scroll Nav Controls */}
        <div className="rail-nav-buttons" aria-label={`${title} 목록 스크롤`}>
          <button type="button" className="rail-arrow-btn" onClick={() => scroll(-1)} aria-label="이전 목록 보기">
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="rail-arrow-btn" onClick={() => scroll(1)} aria-label="다음 목록 보기">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Rail Content Carousel */}
      {movies.length === 0 ? (
        <div className="rail-empty-message">해당 조건에 일치하는 작품이 없습니다.</div>
      ) : (
        <div className={`rail-scroll-track ${numbered ? 'is-numbered-rail' : ''}`} ref={railRef}>
          {movies.map((movie, index) => (
            <div className="rail-item-wrapper" key={movie.movieId}>
              {numbered && (
                <span className="rank-watermark" aria-hidden="true">
                  {index + 1}
                </span>
              )}
              <MovieCard
                movie={movie}
                onSelect={onSelect}
                onPlay={onPlay}
                isWishlisted={wishlistIds.has(movie.movieId)}
                onToggleWishlist={onToggleWishlist}
                showMatch={showMatch}
                showProgress={showProgress}
                aspectRatio={aspectRatio}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
