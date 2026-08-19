import { Bookmark, BookmarkCheck, Calendar, Clock, Info, Play, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type { MovieCard } from '../../../shared/domain.js';
import { artStyle, formatGenre } from '../lib/ott-helpers.js';
import { RatingBadge } from './RatingBadge.js';

interface HeroBillboardProps {
  movie: MovieCard;
  profileName: string;
  onPlay: (movie: MovieCard) => void;
  onDetails: (movie: MovieCard) => void;
  isWishlisted: boolean;
  onToggleWishlist: (movie: MovieCard) => void;
}

export function HeroBillboard({ movie, onPlay, onDetails, isWishlisted, onToggleWishlist }: HeroBillboardProps) {
  const [isMuted, setIsMuted] = useState(true);

  return (
    <section className="ott-hero-billboard" style={artStyle(movie)} aria-label="주요 추천 콘텐츠">
      {/* Background Ambience Layers */}
      <div className="billboard-backdrop">
        <div className="gradient-overlay-left" />
        <div className="gradient-overlay-bottom" />
        <div className="gradient-overlay-top" />
        <div className="backdrop-grain" />
      </div>

      {/* Visual Art Spotlight (Right side cinematic presentation) */}
      <div className="billboard-visual-art" aria-hidden="true">
        <div className="art-poster-frame">
          <div className="art-glow-sphere" />
          <div className="art-inner-content">
            <span className="art-genre-pill">{formatGenre(movie.primaryGenre)}</span>
            <h3 className="art-title-text">{movie.title}</h3>
            <p className="art-subtitle-text">{movie.setting}</p>
            {movie.isPlatformOriginal && <span className="art-original-stamp">SCENEFLOW ONLY</span>}
          </div>
        </div>
      </div>

      {/* Hero Content Info (Left side) */}
      <div className="billboard-content">
        {/* Top Badge */}
        <div className="billboard-badges">
          {movie.isPlatformOriginal ? (
            <span className="badge-original">SCENEFLOW ONLY</span>
          ) : (
            <span className="badge-trending">오늘 대한민국 TOP 10</span>
          )}
        </div>

        {/* Title */}
        <h1 className="billboard-title">{movie.title}</h1>

        {/* Meta Info Bar */}
        <div className="billboard-meta">
          <span className="match-score-badge">
            <Sparkles size={13} /> {movie.matchScore}% 일치
          </span>
          <RatingBadge rating={movie.contentRating} size="md" />
          <span className="meta-text">
            <Calendar size={13} /> {movie.releaseDate.slice(0, 4)}년
          </span>
          <span className="meta-text">
            <Clock size={13} /> {movie.runtimeMinutes}분
          </span>
          <div className="tech-tags">
            <span className="tech-tag">4K UHD</span>
            <span className="tech-tag">HDR10+</span>
          </div>
          <span className="genre-label">
            {formatGenre(movie.primaryGenre)} · {movie.genreDetail}
          </span>
        </div>

        {/* Synopsis / Logline */}
        <p className="billboard-logline">{movie.logline}</p>

        {/* CTA Action Buttons */}
        <div className="billboard-actions">
          <button type="button" className="ott-btn ott-btn-primary" onClick={() => onPlay(movie)}>
            <Play size={20} fill="currentColor" /> 바로보기
          </button>

          <button
            type="button"
            className={`ott-btn ott-btn-wishlist ${isWishlisted ? 'active' : ''}`}
            onClick={() => onToggleWishlist(movie)}
          >
            {isWishlisted ? (
              <>
                <BookmarkCheck size={18} /> 찜한 콘텐츠
              </>
            ) : (
              <>
                <Bookmark size={18} /> 찜하기
              </>
            )}
          </button>

          <button type="button" className="ott-btn ott-btn-secondary" onClick={() => onDetails(movie)}>
            <Info size={18} /> 상세 정보
          </button>

          {/* Sound / Mute Toggle */}
          <button
            type="button"
            className="billboard-audio-toggle"
            onClick={() => setIsMuted((prev) => !prev)}
            aria-label={isMuted ? '오디오 켜기' : '오디오 끄기'}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>
    </section>
  );
}
