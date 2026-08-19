import {
  Bookmark,
  BookmarkCheck,
  Calendar,
  Clock,
  Film,
  Globe,
  Hash,
  Info,
  MessageSquare,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  ThumbsUp,
  User,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MovieCard, MovieReviews } from '../../../shared/domain.js';
import { artStyle, formatGenre, formatReviewDate } from '../lib/ott-helpers.js';
import { RatingBadge } from './RatingBadge.js';

interface MovieModalProps {
  movie: MovieCard;
  allMovies?: MovieCard[];
  onClose: () => void;
  onPlay: (movie: MovieCard) => void;
  isWishlisted: boolean;
  onToggleWishlist: (movie: MovieCard) => void;
  onSelectMovie: (movie: MovieCard) => void;
}

interface ApiError {
  error?: string;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(body.error ?? '요청을 처리하지 못했습니다.');
  }
  return body;
}

export function MovieModal({
  movie,
  allMovies = [],
  onClose,
  onPlay,
  isWishlisted,
  onToggleWishlist,
  onSelectMovie,
}: MovieModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'critics' | 'related'>('info');
  const [reviews, setReviews] = useState<MovieReviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    fetchJson<MovieReviews>(`/api/movies/${encodeURIComponent(movie.movieId)}/reviews`, controller.signal)
      .then((data) => {
        if (isCurrent) {
          setReviews(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : '작품 리뷰를 불러오지 못했습니다.');
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [movie.movieId, retryKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Extract related movies (same genre or director, excluding current)
  const relatedMovies = useMemo(() => {
    return allMovies
      .filter((m) => m.movieId !== movie.movieId)
      .filter(
        (m) =>
          m.primaryGenre === movie.primaryGenre ||
          m.directorName === movie.directorName ||
          m.keywords.split(',').some((k) => movie.keywords.includes(k.trim()))
      )
      .slice(0, 6);
  }, [allMovies, movie]);

  const keywordTags = useMemo(() => {
    return movie.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }, [movie.keywords]);

  return (
    <div className="ott-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="ott-modal-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ott-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={artStyle(movie)}
      >
        {/* Close Button */}
        <button type="button" className="modal-close-icon-btn" onClick={onClose} aria-label="팝업 닫기">
          <X size={20} />
        </button>

        {/* Modal Top Banner (Backdrop Visual) */}
        <div className="modal-hero-banner">
          <div className="modal-banner-gradient" />
          <div className="modal-banner-art">
            <span className="banner-genre">{formatGenre(movie.primaryGenre)}</span>
            <h2 id="ott-modal-title" className="banner-title">
              {movie.title}
            </h2>
            <p className="banner-setting">{movie.setting}</p>
          </div>

          {/* Quick CTA on Top Banner */}
          <div className="modal-hero-cta">
            <button type="button" className="ott-btn ott-btn-primary" onClick={() => onPlay(movie)}>
              <Play size={18} fill="currentColor" /> 지금 재생하기
            </button>
            <button
              type="button"
              className={`ott-btn ott-btn-wishlist ${isWishlisted ? 'active' : ''}`}
              onClick={() => onToggleWishlist(movie)}
            >
              {isWishlisted ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
              {isWishlisted ? '찜한 콘텐츠' : '찜하기'}
            </button>
            <button
              type="button"
              className={`ott-btn ott-btn-circle ${liked ? 'liked' : ''}`}
              onClick={() => setLiked((v) => !v)}
              title="좋아요"
            >
              <ThumbsUp size={16} />
            </button>
            <button
              type="button"
              className="ott-btn ott-btn-circle"
              title="공유하기"
              onClick={() => {
                if (navigator.clipboard) {
                  void navigator.clipboard.writeText(window.location.href).catch(() => {});
                  alert('작품 링크가 클립보드에 복사되었습니다.');
                }
              }}
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {/* Modal Main Content Container */}
        <div className="modal-scroll-body">
          {/* Metadata Specs Bar */}
          <div className="modal-meta-bar">
            <div className="meta-left">
              <span className="match-pill">
                <Sparkles size={12} /> {movie.matchScore}% 취향 일치
              </span>
              <RatingBadge rating={movie.contentRating} size="md" showText />
              <span className="meta-spec">
                <Calendar size={13} /> {movie.releaseDate.slice(0, 4)}년
              </span>
              <span className="meta-spec">
                <Clock size={13} /> {movie.runtimeMinutes}분
              </span>
              <span className="meta-spec tech">4K UHD</span>
              <span className="meta-spec tech">5.1ch</span>
            </div>
            {movie.isPlatformOriginal && <span className="badge-original-text">SCENEFLOW ORIGINAL</span>}
          </div>

          {/* Navigation Tabs (Korean OTT standard) */}
          <div className="modal-tabs-nav" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'info'}
              className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              <Info size={15} /> 작품 상세 & AI 추천 사유
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'users'}
              className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <MessageSquare size={15} /> 시청자 리뷰 ({reviews ? reviews.userReviews.length : '·'})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'critics'}
              className={`tab-btn ${activeTab === 'critics' ? 'active' : ''}`}
              onClick={() => setActiveTab('critics')}
            >
              <Star size={15} /> 평론가 칼럼 ({reviews ? reviews.criticReviews.length : '·'})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'related'}
              className={`tab-btn ${activeTab === 'related' ? 'active' : ''}`}
              onClick={() => setActiveTab('related')}
            >
              <Film size={15} /> 비슷한 콘텐츠 ({relatedMovies.length})
            </button>
          </div>

          {/* Tab 1: Detailed Info & AI Grounded Evidence */}
          {activeTab === 'info' && (
            <div className="tab-pane tab-info-pane">
              {/* Synopsis */}
              <div className="synopsis-section">
                <h3 className="section-title">작품 줄거리</h3>
                <p className="synopsis-text">{movie.logline}</p>
              </div>

              {/* Keywords Tag Cloud */}
              <div className="keywords-cloud">
                <span className="keyword-label">
                  <Hash size={13} /> 테마 키워드:
                </span>
                <div className="tags-list">
                  {keywordTags.map((tag) => (
                    <span key={tag} className="ott-hash-tag">
                      #{tag}
                    </span>
                  ))}
                  <span className="ott-hash-tag">#{formatGenre(movie.primaryGenre)}</span>
                </div>
              </div>

              {/* Databricks AI Recommendation Evidence Grid */}
              <div className="ai-evidence-section">
                <div className="evidence-header">
                  <Sparkles size={16} className="evidence-sparkle" />
                  <h4>Databricks AI 알고리즘 추천 근거</h4>
                  <span className="evidence-sub">Lakehouse Behavioral Analytics</span>
                </div>
                <div className="evidence-grid">
                  {movie.evidence.map((item) => (
                    <div className="evidence-card" key={item.label}>
                      <span className="evidence-label">{item.label}</span>
                      <p className="evidence-detail">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Production Facts Table */}
              <div className="facts-section">
                <h4 className="section-title">상세 정보</h4>
                <div className="facts-grid">
                  <div className="fact-item">
                    <span className="fact-label">
                      <User size={13} /> 감독
                    </span>
                    <span className="fact-value">{movie.directorName}</span>
                  </div>
                  <div className="fact-item">
                    <span className="fact-label">
                      <Film size={13} /> 장르
                    </span>
                    <span className="fact-value">
                      {formatGenre(movie.primaryGenre)} · {movie.genreDetail}
                    </span>
                  </div>
                  <div className="fact-item">
                    <span className="fact-label">
                      <Globe size={13} /> 국가 / 배경
                    </span>
                    <span className="fact-value">
                      {movie.productionCountry} · {movie.setting}
                    </span>
                  </div>
                  <div className="fact-item">
                    <span className="fact-label">
                      <Star size={13} /> 주요 갈등
                    </span>
                    <span className="fact-value">{movie.coreConflict}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: User Reviews */}
          {activeTab === 'users' && (
            <div className="tab-pane tab-reviews-pane">
              {loading ? (
                <div className="tab-status-message">
                  <span className="spinner" />
                  시청자 리뷰를 불러오는 중입니다...
                </div>
              ) : error ? (
                <div className="tab-status-message error">
                  <p>{error}</p>
                  <button type="button" className="ott-btn ott-btn-secondary" onClick={() => setRetryKey((k) => k + 1)}>
                    <RotateCcw size={14} /> 다시 시도
                  </button>
                </div>
              ) : reviews && reviews.userReviews.length > 0 ? (
                <div className="review-cards-list">
                  {reviews.userReviews.map((rev) => (
                    <article className="user-review-box" key={rev.reviewId}>
                      <div className="review-box-header">
                        <div className="reviewer-info">
                          <div className="reviewer-avatar-mini">{rev.displayName.slice(0, 1)}</div>
                          <div>
                            <strong className="reviewer-name">{rev.displayName} 님</strong>
                            <time className="review-date">{formatReviewDate(rev.reviewedAt)}</time>
                          </div>
                        </div>
                        {rev.rating !== null && (
                          <div className="review-star-badge">
                            <Star size={13} fill="currentColor" /> {rev.rating.toFixed(1)}점
                          </div>
                        )}
                      </div>
                      {rev.reviewTitle && <h5 className="review-title">{rev.reviewTitle}</h5>}
                      {rev.reviewText && <p className="review-body">{rev.reviewText}</p>}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-tab-box">
                  <MessageSquare size={24} />
                  <p>등록된 시청자 리뷰가 아직 없습니다.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Critic Columns */}
          {activeTab === 'critics' && (
            <div className="tab-pane tab-critics-pane">
              {loading ? (
                <div className="tab-status-message">
                  <span className="spinner" />
                  평론가 칼럼을 불러오는 중입니다...
                </div>
              ) : error ? (
                <div className="tab-status-message error">
                  <p>{error}</p>
                  <button type="button" className="ott-btn ott-btn-secondary" onClick={() => setRetryKey((k) => k + 1)}>
                    <RotateCcw size={14} /> 다시 시도
                  </button>
                </div>
              ) : reviews && reviews.criticReviews.length > 0 ? (
                <div className="critic-cards-list">
                  {reviews.criticReviews.map((critic) => (
                    <article className="critic-review-box" key={critic.criticReviewId}>
                      <div className="critic-box-header">
                        <div className="critic-score-row">
                          <div className="critic-score-number">
                            <Star size={16} fill="currentColor" />
                            <strong>{critic.score100}</strong>
                            <span>/ 100</span>
                          </div>
                          <span className="grade-badge">{critic.letterGrade}</span>
                        </div>
                        {critic.isTopCritic && <span className="top-critic-pill">⭐ TOP CRITIC</span>}
                      </div>
                      <h5 className="critic-title">“{critic.reviewTitle}”</h5>
                      <p className="critic-body">{critic.reviewText}</p>
                      <div className="critic-footer">
                        <span className="critic-author">
                          <strong>{critic.penName}</strong> 평론가 ({critic.publicationName})
                        </span>
                        <time className="critic-date">{formatReviewDate(critic.reviewedAt)}</time>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-tab-box">
                  <Star size={24} />
                  <p>등록된 평론가 평론이 아직 없습니다.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Related Content */}
          {activeTab === 'related' && (
            <div className="tab-pane tab-related-pane">
              {relatedMovies.length > 0 ? (
                <div className="related-grid">
                  {relatedMovies.map((item) => (
                    <div
                      key={item.movieId}
                      className="related-item-card"
                      style={artStyle(item)}
                      onClick={() => onSelectMovie(item)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="related-poster">
                        <RatingBadge rating={item.contentRating} size="sm" />
                        <strong className="related-title-art">{item.title}</strong>
                        <span className="related-genre">{formatGenre(item.primaryGenre)}</span>
                      </div>
                      <div className="related-info">
                        <strong>{item.title}</strong>
                        <span>
                          {item.releaseDate.slice(0, 4)} · {formatGenre(item.primaryGenre)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-tab-box">
                  <Film size={24} />
                  <p>비슷한 추천 작품을 탐색 중입니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
