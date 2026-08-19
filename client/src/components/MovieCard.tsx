import { Bookmark, BookmarkCheck, Info, Play, Sparkles, Star } from 'lucide-react';
import type { MovieCard as MovieCardType } from '../../../shared/domain.js';
import { artStyle, formatGenre, scoreLabel } from '../lib/ott-helpers.js';
import { RatingBadge } from './RatingBadge.js';

interface MovieCardProps {
  movie: MovieCardType;
  onSelect: (movie: MovieCardType) => void;
  onPlay: (movie: MovieCardType) => void;
  isWishlisted: boolean;
  onToggleWishlist: (movie: MovieCardType) => void;
  showMatch?: boolean;
  showProgress?: boolean;
  aspectRatio?: 'poster' | 'landscape';
}

export function MovieCard({
  movie,
  onSelect,
  onPlay,
  isWishlisted,
  onToggleWishlist,
  showMatch = false,
  showProgress = false,
  aspectRatio = 'poster',
}: MovieCardProps) {
  return (
    <div
      className={`ott-movie-card card-ratio-${aspectRatio}`}
      style={artStyle(movie)}
      onClick={() => onSelect(movie)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(movie);
        }
      }}
      aria-label={`${movie.title} 상세 정보`}
    >
      {/* Visual Poster Frame */}
      <div className="card-poster">
        <div className="poster-gradient" />
        <div className="poster-grain" />

        {/* Top Badges (Korean OTT Style) */}
        <div className="card-top-badges">
          <RatingBadge rating={movie.contentRating} size="sm" />
          {movie.isPlatformOriginal && <span className="card-badge-original">ONLY</span>}
          {showMatch && (
            <span className="card-badge-match">
              <Sparkles size={10} /> {movie.matchScore}%
            </span>
          )}
        </div>

        {/* Center Title Artwork */}
        <div className="card-artwork">
          <span className="card-genre-pill">{formatGenre(movie.primaryGenre)}</span>
          <span className="card-monogram">{movie.title.slice(0, 1)}</span>
          <strong className="card-title-art">{movie.title}</strong>
        </div>

        {/* Bottom Tech/Spec Tag */}
        <div className="card-bottom-specs">
          <span className="card-spec-pill">UHD</span>
        </div>

        {/* Hover Quick Action Buttons */}
        <div className="card-hover-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="hover-action-row">
            <button
              type="button"
              className="quick-play-btn"
              onClick={() => onPlay(movie)}
              title="지금 재생"
              aria-label={`${movie.title} 바로보기`}
            >
              <Play size={16} fill="currentColor" />
            </button>
            <button
              type="button"
              className={`quick-wishlist-btn ${isWishlisted ? 'active' : ''}`}
              onClick={() => onToggleWishlist(movie)}
              title={isWishlisted ? '찜한 콘텐츠에서 제거' : '찜하기'}
              aria-label="찜하기"
            >
              {isWishlisted ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
            <button
              type="button"
              className="quick-info-btn"
              onClick={() => onSelect(movie)}
              title="상세 정보"
              aria-label="상세 정보"
            >
              <Info size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar (for Continue Watching) */}
      {showProgress && movie.progressPct !== undefined && (
        <div className="card-progress-bar" aria-label={`${movie.progressPct}% 시청`}>
          <div className="progress-fill" style={{ width: `${movie.progressPct}%` }} />
        </div>
      )}

      {/* Card Info Details */}
      <div className="card-info">
        <div className="card-title-row">
          <strong className="movie-title">{movie.title}</strong>
        </div>

        <div className="card-meta-row">
          <span className="meta-score">
            {showMatch ? (
              <span className="match-val">
                <Sparkles size={11} /> {movie.matchScore}% 일치
              </span>
            ) : movie.averageUserRating ? (
              <span className="rating-val">
                <Star size={11} fill="currentColor" /> {movie.averageUserRating.toFixed(1)}
              </span>
            ) : (
              <span className="score-val">{scoreLabel(movie)}</span>
            )}
          </span>
          <span className="meta-year">{movie.releaseDate.slice(0, 4)}</span>
          <span className="meta-genre">{formatGenre(movie.primaryGenre)}</span>
        </div>

        {/* Subtitle / Progress tag */}
        <p className="card-subtext">
          {showProgress && movie.progressPct !== undefined
            ? `${movie.progressPct}% 시청 완료 · 이어보기`
            : movie.genreDetail}
        </p>
      </div>
    </div>
  );
}
