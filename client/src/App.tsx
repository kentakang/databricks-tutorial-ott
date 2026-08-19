import { ChevronDown, ChevronLeft, ChevronRight, Info, Play, Search, Sparkles, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { HomeFeed, MovieCard, MovieReviews } from '../../shared/domain.js';

interface UserSummary {
  userId: string;
  displayName: string;
  preferredGenre: string;
  subscriptionPlan: string;
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

function artStyle(movie: MovieCard): CSSProperties {
  const seed = [...`${movie.primaryGenre}${movie.movieId}`].reduce(
    (total, character) => total + (character.codePointAt(0) ?? 0),
    0
  );
  return {
    '--art-hue': `${seed % 360}`,
    '--art-hue-alt': `${(seed * 7 + 73) % 360}`,
  } as CSSProperties;
}

function formatPlan(plan: string): string {
  const normalized = plan.toLowerCase();
  if (normalized.includes('premium')) return 'Premium';
  if (normalized.includes('standard')) return 'Standard';
  return plan;
}

function formatGenre(genre: string): string {
  const labels: Record<string, string> = {
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
  return labels[genre] ?? genre;
}

function scoreLabel(movie: MovieCard): string {
  if (movie.averageCriticScore !== null) {
    return `평론가 ${Math.round(movie.averageCriticScore)}`;
  }
  if (movie.averageUserRating !== null) {
    return `시청자 ${movie.averageUserRating.toFixed(1)}`;
  }
  return 'SceneFlow 추천';
}

function formatReviewDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

export default function App() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<MovieCard | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const pendingCurationUserId =
    feed?.aiCuration.source === 'ai-pending' && feed.profile.userId === selectedUserId ? selectedUserId : null;

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<UserSummary[]>('/api/users', controller.signal)
      .then((profiles) => {
        setUsers(profiles);
        const defaultProfile = profiles.find((profile) => profile.userId === 'USR0001');
        setLoadingFeed(true);
        setSelectedUserId((current) => current || defaultProfile?.userId || profiles[0]?.userId || '');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '사용자 목록을 불러오지 못했습니다.');
      })
      .finally(() => setLoadingUsers(false));

    return () => controller.abort();
  }, [retryKey]);

  useEffect(() => {
    if (!selectedUserId) return;
    const controller = new AbortController();
    fetchJson<HomeFeed>(`/api/home/${encodeURIComponent(selectedUserId)}`, controller.signal)
      .then(setFeed)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '개인화 홈을 불러오지 못했습니다.');
      })
      .finally(() => setLoadingFeed(false));

    return () => controller.abort();
  }, [selectedUserId, retryKey]);

  useEffect(() => {
    if (!pendingCurationUserId) return;
    const controller = new AbortController();
    fetchJson<HomeFeed>(`/api/curation/${encodeURIComponent(pendingCurationUserId)}`, controller.signal)
      .then(setFeed)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setFeed((current) =>
          current?.profile.userId === pendingCurationUserId
            ? {
                ...current,
                aiCuration: {
                  ...current.aiCuration,
                  source: 'deterministic-fallback',
                  label: '취향 기반 큐레이션',
                },
              }
            : current
        );
      });

    return () => controller.abort();
  }, [pendingCurationUserId]);

  useEffect(() => {
    if (!selectedMovie) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedMovie(null);
    };
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedMovie]);

  const searchResults = useMemo(() => {
    if (!feed || searchQuery.trim().length < 2) return [];
    const needle = searchQuery.trim().toLowerCase();
    const allMovies = [
      ...feed.rails.aiThemes.flatMap((theme) => theme.movies),
      ...feed.rails.continueWatching,
      ...feed.rails.trending,
    ];
    const unique = new Map(allMovies.map((movie) => [movie.movieId, movie]));
    return [...unique.values()].filter((movie) =>
      [
        movie.title,
        movie.primaryGenre,
        formatGenre(movie.primaryGenre),
        movie.genreDetail,
        movie.keywords,
        movie.directorName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [feed, searchQuery]);

  const play = (movie: MovieCard) => {
    setToast(`〈${movie.title}〉 재생을 시작합니다 · 시연 모드`);
    window.setTimeout(() => setToast(null), 2800);
  };

  const selectUser = (userId: string) => {
    setError(null);
    setLoadingFeed(true);
    setSelectedMovie(null);
    setSelectedUserId(userId);
  };

  const retry = () => {
    setError(null);
    setLoadingUsers(true);
    setLoadingFeed(Boolean(selectedUserId));
    setRetryKey((value) => value + 1);
  };

  return (
    <div className="app-shell">
      <Header
        users={users}
        selectedUserId={selectedUserId}
        onUserChange={selectUser}
        loading={loadingUsers}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !feed || loadingFeed ? (
        <LoadingState changingProfile={Boolean(feed)} />
      ) : (
        <main>
          <Hero movie={feed.hero} profileName={feed.profile.displayName} onPlay={play} onDetails={setSelectedMovie} />

          <section className="taste-strip" aria-label="개인화 요약">
            <div className="taste-icon" aria-hidden="true">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="eyebrow">오늘의 취향 브리핑</span>
              <h2>{feed.tasteSummary.headline}</h2>
              <p>{feed.tasteSummary.details}</p>
              <span className={`ai-curation-pill ${feed.aiCuration.source}`}>
                <Sparkles size={11} /> {feed.aiCuration.label} · {feed.aiCuration.themeCount}개 추천 주제
              </span>
            </div>
            <dl>
              <div>
                <dt>시청 작품</dt>
                <dd>{feed.tasteSummary.watchedTitles}</dd>
              </div>
              <div>
                <dt>평가 작품</dt>
                <dd>{feed.tasteSummary.ratedTitles}</dd>
              </div>
            </dl>
          </section>

          <div className="content-rails">
            {searchQuery.trim().length >= 2 ? (
              <MovieRail
                id="search-results"
                title={`“${searchQuery.trim()}” 검색 결과`}
                subtitle={`${searchResults.length}개의 작품`}
                movies={searchResults}
                onSelect={setSelectedMovie}
              />
            ) : (
              <>
                {feed.rails.aiThemes.map((theme) => (
                  <MovieRail
                    key={theme.themeId}
                    id={theme.themeId}
                    title={theme.title}
                    subtitle={theme.subtitle}
                    movies={theme.movies}
                    onSelect={setSelectedMovie}
                    showMatch
                    badge={
                      feed.aiCuration.source === 'foundation-model'
                        ? 'AI CURATED'
                        : feed.aiCuration.source === 'ai-pending'
                          ? 'AI CURATING'
                          : 'FOR YOU'
                    }
                  />
                ))}
                {feed.rails.continueWatching.length > 0 && (
                  <MovieRail
                    id="continue-watching"
                    title="이어보기"
                    subtitle="멈춘 장면부터 바로 이어서"
                    movies={feed.rails.continueWatching}
                    onSelect={setSelectedMovie}
                    showProgress
                  />
                )}
                <MovieRail
                  id="trending"
                  title="지금 SceneFlow에서 뜨는 작품"
                  subtitle="완주율·시청자·평론가 반응을 종합한 순위"
                  movies={feed.rails.trending}
                  onSelect={setSelectedMovie}
                  numbered
                />
              </>
            )}
          </div>
        </main>
      )}

      {selectedMovie && (
        <MovieModal
          key={selectedMovie.movieId}
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onPlay={play}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Header({
  users,
  selectedUserId,
  onUserChange,
  loading,
  searchQuery,
  onSearchChange,
}: {
  users: UserSummary[];
  selectedUserId: string;
  onUserChange: (value: string) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  const selected = users.find((user) => user.userId === selectedUserId);
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="SceneFlow 홈">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>SceneFlow</span>
      </a>
      <nav aria-label="주요 메뉴">
        <a href="#ai-theme-1">홈</a>
        <a href="#trending">영화</a>
        <a href="#continue-watching">내가 찜한 콘텐츠</a>
      </nav>
      <div className="header-actions">
        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">작품 검색</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="제목, 장르, 감독 검색"
          />
        </label>
        <label className="demo-selector">
          <span className="demo-label">
            <Sparkles size={12} /> 영업 데모
          </span>
          <span className="sr-only">추천을 확인할 사용자 선택</span>
          <select
            value={selectedUserId}
            onChange={(event) => onUserChange(event.target.value)}
            disabled={loading || users.length === 0}
          >
            {users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.displayName} · {formatGenre(user.preferredGenre)} · {formatPlan(user.subscriptionPlan)}
              </option>
            ))}
          </select>
          <span className="selector-avatar" aria-hidden="true">
            {selected?.displayName.slice(0, 1) ?? 'S'}
          </span>
          <ChevronDown className="selector-chevron" size={15} aria-hidden="true" />
        </label>
      </div>
    </header>
  );
}

function Hero({
  movie,
  profileName,
  onPlay,
  onDetails,
}: {
  movie: MovieCard;
  profileName: string;
  onPlay: (movie: MovieCard) => void;
  onDetails: (movie: MovieCard) => void;
}) {
  return (
    <section id="top" className="hero" style={artStyle(movie)}>
      <div className="hero-noise" />
      <div className="hero-orbit hero-orbit-one" />
      <div className="hero-orbit hero-orbit-two" />
      <div className="hero-content">
        <span className="hero-kicker">
          <Sparkles size={14} /> {profileName}님을 위한 오늘의 선택
        </span>
        {movie.isPlatformOriginal && <span className="original-badge">SCENEFLOW ORIGINAL</span>}
        <h1>{movie.title}</h1>
        <div className="hero-meta">
          <strong>{movie.matchScore}% 일치</strong>
          <span>{movie.releaseDate.slice(0, 4)}</span>
          <span>{movie.contentRating}</span>
          <span>{movie.runtimeMinutes}분</span>
          <span>UHD</span>
        </div>
        <p className="hero-logline">{movie.logline}</p>
        <p className="hero-reason">
          <Sparkles size={15} /> {movie.reason}
        </p>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={() => onPlay(movie)}>
            <Play size={20} fill="currentColor" /> 재생
          </button>
          <button className="secondary-button" type="button" onClick={() => onDetails(movie)}>
            <Info size={20} /> 상세 정보
          </button>
        </div>
      </div>
      <div className="hero-title-art" aria-hidden="true">
        <span>{formatGenre(movie.primaryGenre)}</span>
        <strong>{movie.title}</strong>
        <small>{movie.setting}</small>
      </div>
      <div className="hero-fade" />
    </section>
  );
}

function MovieRail({
  id,
  title,
  subtitle,
  movies,
  onSelect,
  showMatch = false,
  showProgress = false,
  numbered = false,
  badge,
}: {
  id: string;
  title: string;
  subtitle: string;
  movies: MovieCard[];
  onSelect: (movie: MovieCard) => void;
  showMatch?: boolean;
  showProgress?: boolean;
  numbered?: boolean;
  badge?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => {
    railRef.current?.scrollBy({ left: direction * 760, behavior: 'smooth' });
  };

  return (
    <section id={id} className="rail-section">
      <div className="rail-heading">
        <div>
          <div className="rail-title-line">
            {badge && (
              <span className="ai-rail-badge">
                <Sparkles size={10} /> {badge}
              </span>
            )}
            <h2>{title}</h2>
          </div>
          <p>{subtitle}</p>
        </div>
        <div className="rail-controls" aria-label={`${title} 스크롤`}>
          <button type="button" onClick={() => scroll(-1)} aria-label="이전 작품">
            <ChevronLeft size={20} />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label="다음 작품">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      {movies.length === 0 ? (
        <div className="empty-rail">조건에 맞는 작품을 찾지 못했어요.</div>
      ) : (
        <div className={`movie-rail${numbered ? ' numbered-rail' : ''}`} ref={railRef}>
          {movies.map((movie, index) => (
            <div className="ranked-card" key={movie.movieId}>
              {numbered && (
                <span className="rank-number" aria-label={`${index + 1}위`}>
                  {index + 1}
                </span>
              )}
              <MovieTile movie={movie} onSelect={onSelect} showMatch={showMatch} showProgress={showProgress} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MovieTile({
  movie,
  onSelect,
  showMatch,
  showProgress,
}: {
  movie: MovieCard;
  onSelect: (movie: MovieCard) => void;
  showMatch: boolean;
  showProgress: boolean;
}) {
  return (
    <button className="movie-card" type="button" style={artStyle(movie)} onClick={() => onSelect(movie)}>
      <span className="card-art">
        <span className="card-grain" />
        <span className="card-genre">{formatGenre(movie.primaryGenre)}</span>
        <span className="card-monogram">{movie.title.slice(0, 1)}</span>
        <span className="card-title-art">{movie.title}</span>
        {movie.isPlatformOriginal && <span className="card-original">S</span>}
      </span>
      {showProgress && movie.progressPct !== undefined && (
        <span className="progress-track" aria-label={`${movie.progressPct}% 시청`}>
          <span style={{ width: `${movie.progressPct}%` }} />
        </span>
      )}
      <span className="card-copy">
        <strong>{movie.title}</strong>
        <span className="card-meta">
          {showMatch ? <b>{movie.matchScore}% 일치</b> : <b>{scoreLabel(movie)}</b>}
          <span>{movie.releaseDate.slice(0, 4)}</span>
          <span>{movie.contentRating}</span>
        </span>
        <small>
          {showProgress && movie.progressPct !== undefined
            ? `${movie.progressPct}% 시청 · 이어보기`
            : movie.genreDetail}
        </small>
      </span>
    </button>
  );
}

function MovieModal({
  movie,
  onClose,
  onPlay,
}: {
  movie: MovieCard;
  onClose: () => void;
  onPlay: (movie: MovieCard) => void;
}) {
  const [reviews, setReviews] = useState<MovieReviews | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState<'critic' | 'user'>('critic');
  const [reviewRetryKey, setReviewRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<MovieReviews>(`/api/movies/${encodeURIComponent(movie.movieId)}/reviews`, controller.signal)
      .then(setReviews)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setReviewsError(reason instanceof Error ? reason.message : '작품 리뷰를 불러오지 못했습니다.');
      })
      .finally(() => setReviewsLoading(false));

    return () => controller.abort();
  }, [movie.movieId, reviewRetryKey]);

  const retryReviews = () => {
    setReviews(null);
    setReviewsError(null);
    setReviewsLoading(true);
    setReviewRetryKey((value) => value + 1);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="movie-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={artStyle(movie)}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="상세 정보 닫기">
          <X />
        </button>
        <div className="modal-art">
          <span>{formatGenre(movie.primaryGenre)}</span>
          <strong>{movie.title}</strong>
          <small>{movie.setting}</small>
        </div>
        <div className="modal-content">
          <span className="eyebrow">왜 이 작품일까요?</span>
          <h2 id="movie-modal-title">{movie.title}</h2>
          <div className="modal-meta">
            <strong>{movie.matchScore}% 일치</strong>
            <span>{movie.releaseDate.slice(0, 4)}</span>
            <span>{movie.runtimeMinutes}분</span>
            <span>{movie.contentRating}</span>
          </div>
          <p className="modal-logline">{movie.logline}</p>
          <div className="evidence-grid">
            {movie.evidence.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
          <dl className="movie-facts">
            <div>
              <dt>감독</dt>
              <dd>{movie.directorName}</dd>
            </div>
            <div>
              <dt>장르</dt>
              <dd>
                {formatGenre(movie.primaryGenre)} · {movie.genreDetail}
              </dd>
            </div>
            <div>
              <dt>배경</dt>
              <dd>{movie.setting}</dd>
            </div>
            <div>
              <dt>키워드</dt>
              <dd>{movie.keywords}</dd>
            </div>
          </dl>
          <button className="primary-button modal-play" type="button" onClick={() => onPlay(movie)}>
            <Play size={19} fill="currentColor" /> 지금 재생
          </button>

          <section className="review-panel" aria-labelledby="review-panel-title">
            <div className="review-heading">
              <div>
                <span className="eyebrow">작품을 더 깊이</span>
                <h3 id="review-panel-title">리뷰 &amp; 평론</h3>
              </div>
              <span>전체 의견 보기</span>
            </div>

            <div className="review-tabs" role="tablist" aria-label="리뷰 종류">
              <button
                className={activeReviewTab === 'critic' ? 'review-tab active' : 'review-tab'}
                type="button"
                role="tab"
                aria-selected={activeReviewTab === 'critic'}
                onClick={() => setActiveReviewTab('critic')}
              >
                평론가 평론 <b>{reviews ? reviews.criticReviews.length : '·'}</b>
              </button>
              <button
                className={activeReviewTab === 'user' ? 'review-tab active' : 'review-tab'}
                type="button"
                role="tab"
                aria-selected={activeReviewTab === 'user'}
                onClick={() => setActiveReviewTab('user')}
              >
                사용자 리뷰 <b>{reviews ? reviews.userReviews.length : '·'}</b>
              </button>
            </div>

            {reviewsLoading ? (
              <div className="review-status" role="status">
                <span className="review-loader" />
                작품에 대한 의견을 모으고 있어요.
              </div>
            ) : reviewsError ? (
              <div className="review-status review-error" role="alert">
                <p>{reviewsError}</p>
                <button type="button" onClick={retryReviews}>
                  다시 시도
                </button>
              </div>
            ) : reviews && activeReviewTab === 'critic' ? (
              <div className="review-list" role="tabpanel">
                {reviews.criticReviews.length > 0 ? (
                  reviews.criticReviews.map((review) => (
                    <article className="review-card critic-review-card" key={review.criticReviewId}>
                      <header>
                        <div>
                          <div className="critic-score">
                            <Star size={14} fill="currentColor" aria-hidden="true" />
                            <strong>{review.score100}</strong>
                            <span>/ 100 · {review.letterGrade}</span>
                          </div>
                          <h4>{review.reviewTitle}</h4>
                        </div>
                        {review.isTopCritic && <span className="top-critic-badge">TOP CRITIC</span>}
                      </header>
                      <p>“{review.reviewText}”</p>
                      <footer>
                        <span>
                          {review.penName} · {review.publicationName}
                        </span>
                        <time dateTime={review.reviewedAt}>{formatReviewDate(review.reviewedAt)}</time>
                      </footer>
                    </article>
                  ))
                ) : (
                  <ReviewEmptyState label="등록된 평론가 평론이 없습니다." />
                )}
              </div>
            ) : reviews ? (
              <div className="review-list" role="tabpanel">
                {reviews.userReviews.length > 0 ? (
                  reviews.userReviews.map((review) => (
                    <article className="review-card user-review-card" key={review.reviewId}>
                      <header>
                        <div className="reviewer">
                          <span className="reviewer-avatar" aria-hidden="true">
                            {review.displayName.slice(0, 1)}
                          </span>
                          <div>
                            <strong>{review.displayName}</strong>
                            <time dateTime={review.reviewedAt}>{formatReviewDate(review.reviewedAt)}</time>
                          </div>
                        </div>
                        {review.rating !== null && (
                          <span className="user-rating">
                            <Star size={13} fill="currentColor" aria-hidden="true" /> {review.rating.toFixed(1)}
                          </span>
                        )}
                      </header>
                      {review.reviewTitle && <h4>{review.reviewTitle}</h4>}
                      {review.reviewText && <p>{review.reviewText}</p>}
                    </article>
                  ))
                ) : (
                  <ReviewEmptyState label="등록된 사용자 리뷰가 없습니다." />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function ReviewEmptyState({ label }: { label: string }) {
  return (
    <div className="review-empty">
      <Star size={18} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

function LoadingState({ changingProfile }: { changingProfile: boolean }) {
  return (
    <main className="loading-state" aria-live="polite">
      <div className="loading-hero">
        <div className="loading-shimmer" />
      </div>
      <div className="loading-copy">
        <span className="loading-pulse">
          <Sparkles size={20} />
        </span>
        <h2>{changingProfile ? 'AI가 새로운 추천 주제를 만드는 중' : 'AI가 당신의 SceneFlow를 구성하는 중'}</h2>
        <p>시청 기록과 작품 반응을 읽고 여러 취향 컬렉션으로 편성하고 있어요.</p>
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="error-state">
      <div className="error-mark">!</div>
      <h2>잠시 흐름이 끊겼어요</h2>
      <p>{message}</p>
      <button className="primary-button" type="button" onClick={onRetry}>
        다시 연결
      </button>
    </main>
  );
}
