import { AlertCircle, Bookmark, RotateCcw, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { HomeFeed, MovieCard as MovieCardType } from '../../shared/domain.js';
import { DailyTasteBriefing } from './components/DailyTasteBriefing.js';
import { Footer } from './components/Footer.js';
import { Header } from './components/Header.js';
import { HeroBillboard } from './components/HeroBillboard.js';
import { MovieCard } from './components/MovieCard.js';
import { MovieModal } from './components/MovieModal.js';
import { MovieRail } from './components/MovieRail.js';
import { QuickCategoryPills } from './components/QuickCategoryPills.js';
import { Toast } from './components/Toast.js';
import { formatGenre, type UserSummary } from './lib/ott-helpers.js';

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

export default function App() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<MovieCardType | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'play' } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [activeNav, setActiveNav] = useState('home');
  const [activeCategory, setActiveCategory] = useState('all');

  // Local Wishlist state (persisted in session)
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('sceneflow_wishlist');
      return saved ? new Set<string>(JSON.parse(saved) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const showToast = (message: string, type: 'success' | 'info' | 'play' = 'info') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const toggleWishlist = (movie: MovieCardType) => {
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(movie.movieId)) {
        next.delete(movie.movieId);
        showToast(`〈${movie.title}〉 찜 목록에서 삭제되었습니다.`, 'info');
      } else {
        next.add(movie.movieId);
        showToast(`〈${movie.title}〉 찜한 콘텐츠에 추가되었습니다.`, 'success');
      }
      try {
        sessionStorage.setItem('sceneflow_wishlist', JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const pendingCurationUserId =
    feed?.aiCuration.source === 'ai-pending' && feed.profile.userId === selectedUserId ? selectedUserId : null;

  // Load User Personas
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<UserSummary[]>('/api/users', controller.signal)
      .then((profiles) => {
        setUsers(profiles);
        const defaultProfile = profiles.find((profile) => profile.userId === 'USR0001');
        setSelectedUserId((current) => current || defaultProfile?.userId || profiles[0]?.userId || '');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '사용자 목록을 불러오지 못했습니다.');
      })
      .finally(() => setLoadingUsers(false));

    return () => controller.abort();
  }, [retryKey]);

  // Load Home Feed for selected user
  useEffect(() => {
    if (!selectedUserId) return;
    const controller = new AbortController();
    fetchJson<HomeFeed>(`/api/home/${encodeURIComponent(selectedUserId)}`, controller.signal)
      .then((data) => {
        setFeed(data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '개인화 홈을 불러오지 못했습니다.');
      })
      .finally(() => setLoadingFeed(false));

    return () => controller.abort();
  }, [selectedUserId, retryKey]);

  // Poll / Listen for AI curation completion if pending
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
                  retrievalSource: 'deterministic-fallback',
                  retrievedCandidateCount: 0,
                },
              }
            : current
        );
      });

    return () => controller.abort();
  }, [pendingCurationUserId]);

  // Handle modal backdrop overflow
  useEffect(() => {
    if (selectedMovie) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [selectedMovie]);

  // Collect all unique movies across rails for search & related lookups
  const allKnownMovies = useMemo(() => {
    if (!feed) return [];
    const list = [
      feed.hero,
      ...feed.rails.aiThemes.flatMap((theme) => theme.movies),
      ...feed.rails.continueWatching,
      ...feed.rails.trending,
    ];
    const map = new Map<string, MovieCardType>();
    for (const m of list) {
      if (!map.has(m.movieId)) map.set(m.movieId, m);
    }
    return [...map.values()];
  }, [feed]);

  // Wishlisted movies list
  const wishlistedMovies = useMemo(() => {
    return allKnownMovies.filter((m) => wishlistIds.has(m.movieId));
  }, [allKnownMovies, wishlistIds]);

  // Platform Originals
  const originalMovies = useMemo(() => {
    return allKnownMovies.filter((m) => m.isPlatformOriginal);
  }, [allKnownMovies]);

  // Highly-rated Critic Masterpieces
  const criticTopMovies = useMemo(() => {
    return allKnownMovies
      .filter((m) => m.averageCriticScore !== null && m.averageCriticScore >= 80)
      .sort((a, b) => (b.averageCriticScore ?? 0) - (a.averageCriticScore ?? 0));
  }, [allKnownMovies]);

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return [];
    const needle = searchQuery.trim().toLowerCase();
    return allKnownMovies.filter((movie) =>
      [
        movie.title,
        movie.primaryGenre,
        formatGenre(movie.primaryGenre),
        movie.genreDetail,
        movie.keywords,
        movie.directorName,
        movie.logline,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [allKnownMovies, searchQuery]);

  const handlePlay = (movie: MovieCardType) => {
    showToast(`〈${movie.title}〉 재생을 시작합니다.`, 'play');
  };

  const handleSelectUser = (userId: string) => {
    setError(null);
    setLoadingFeed(true);
    setSelectedMovie(null);
    setSelectedUserId(userId);
    const user = users.find((u) => u.userId === userId);
    if (user) {
      showToast(`${user.displayName} 님으로 전환되었습니다.`, 'info');
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    setActiveCategory(categoryId);
    const elementMap: Record<string, string> = {
      all: 'top',
      top10: 'trending-rail',
      'ai-themes': 'ai-theme-0',
      original: 'originals-rail',
      continue: 'continue-rail',
      critics: 'critics-rail',
    };
    const targetId = elementMap[categoryId];
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const retry = () => {
    setError(null);
    setLoadingUsers(true);
    setLoadingFeed(Boolean(selectedUserId));
    setRetryKey((value) => value + 1);
  };

  return (
    <div className="ott-app-shell">
      {/* Header */}
      <Header
        users={users}
        selectedUserId={selectedUserId}
        onUserChange={handleSelectUser}
        loading={loadingUsers}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        wishlistCount={wishlistIds.size}
      />

      {/* Main Content Area */}
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !feed || loadingFeed ? (
        <LoadingState changingProfile={Boolean(feed)} />
      ) : (
        <main className="ott-main-content">
          {/* Active Navigation: MY (내가 찜한 콘텐츠 - 2D Grid) */}
          {activeNav === 'my' ? (
            <div className="my-list-page">
              <div className="my-list-header">
                <div className="my-title-row">
                  <Bookmark size={22} className="my-icon" />
                  <h2>내가 찜한 콘텐츠</h2>
                </div>
                <p>총 {wishlistedMovies.length}개의 작품이 보관되어 있습니다.</p>
              </div>
              {wishlistedMovies.length > 0 ? (
                <div className="ott-movie-grid">
                  {wishlistedMovies.map((movie) => (
                    <MovieCard
                      key={movie.movieId}
                      movie={movie}
                      onSelect={setSelectedMovie}
                      onPlay={handlePlay}
                      isWishlisted={wishlistIds.has(movie.movieId)}
                      onToggleWishlist={toggleWishlist}
                    />
                  ))}
                </div>
              ) : (
                <div className="my-empty-state">
                  <Bookmark size={36} />
                  <h3>찜한 콘텐츠가 없습니다</h3>
                  <p>마음에 드는 작품의 &apos;+ 찜하기&apos; 버튼을 눌러 보관해 보세요.</p>
                  <button type="button" className="ott-btn ott-btn-primary" onClick={() => setActiveNav('home')}>
                    홈으로 이동
                  </button>
                </div>
              )}
            </div>
          ) : searchQuery.trim().length >= 2 ? (
            /* Search Results View - 2D Grid */
            <div className="search-results-page">
              <div className="search-header">
                <h2>
                  <Search size={22} /> “{searchQuery.trim()}” 검색 결과
                </h2>
                <p>총 {searchResults.length}개의 작품</p>
              </div>
              {searchResults.length > 0 ? (
                <div className="ott-movie-grid">
                  {searchResults.map((movie) => (
                    <MovieCard
                      key={movie.movieId}
                      movie={movie}
                      onSelect={setSelectedMovie}
                      onPlay={handlePlay}
                      isWishlisted={wishlistIds.has(movie.movieId)}
                      onToggleWishlist={toggleWishlist}
                      showMatch
                    />
                  ))}
                </div>
              ) : (
                <div className="search-empty-state">
                  <Search size={36} />
                  <p>일치하는 작품을 찾지 못했습니다.</p>
                </div>
              )}
            </div>
          ) : (
            /* Standard Korean OTT Home View */
            <>
              {/* Cinematic Wide Billboard Hero */}
              <HeroBillboard
                movie={feed.hero}
                profileName={feed.profile.displayName}
                onPlay={handlePlay}
                onDetails={setSelectedMovie}
                isWishlisted={wishlistIds.has(feed.hero.movieId)}
                onToggleWishlist={toggleWishlist}
              />

              {/* Quick Category Filter Bar */}
              <QuickCategoryPills
                activeCategory={activeCategory}
                onSelectCategory={handleCategorySelect}
                hasContinueWatching={feed.rails.continueWatching.length > 0}
              />

              {/* Taste Briefing Bar */}
              <DailyTasteBriefing feed={feed} />

              {/* Content Rails */}
              <div className="ott-rails-stack">
                {/* 1. Realtime TOP 10 Ranking */}
                <MovieRail
                  id="trending-rail"
                  title="지금 대한민국 TOP 10"
                  movies={feed.rails.trending}
                  onSelect={setSelectedMovie}
                  onPlay={handlePlay}
                  wishlistIds={wishlistIds}
                  onToggleWishlist={toggleWishlist}
                  numbered
                  badge="TOP 10"
                />

                {/* 2. AI Personalized Theme Rails */}
                {feed.rails.aiThemes.map((theme, index) => (
                  <MovieRail
                    key={theme.themeId}
                    id={`ai-theme-${index}`}
                    title={theme.title}
                    movies={theme.movies}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    showMatch
                    badge="맞춤 추천"
                  />
                ))}

                {/* 3. Continue Watching */}
                {feed.rails.continueWatching.length > 0 && (
                  <MovieRail
                    id="continue-rail"
                    title="시청 중인 콘텐츠"
                    movies={feed.rails.continueWatching}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    showProgress
                    badge="이어보기"
                  />
                )}

                {/* 4. SceneFlow Originals */}
                {originalMovies.length > 0 && (
                  <MovieRail
                    id="originals-rail"
                    title="SceneFlow 오리지널"
                    movies={originalMovies}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    badge="ONLY"
                  />
                )}

                {/* 5. Critic Masterpieces */}
                {criticTopMovies.length > 0 && (
                  <MovieRail
                    id="critics-rail"
                    title="평론가 호평작"
                    movies={criticTopMovies}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    badge="CRITIC"
                  />
                )}
              </div>
            </>
          )}
        </main>
      )}

      {/* Detailed Movie Modal */}
      {selectedMovie && (
        <MovieModal
          key={selectedMovie.movieId}
          movie={selectedMovie}
          allMovies={allKnownMovies}
          onClose={() => setSelectedMovie(null)}
          onPlay={handlePlay}
          isWishlisted={wishlistIds.has(selectedMovie.movieId)}
          onToggleWishlist={toggleWishlist}
          onSelectMovie={setSelectedMovie}
        />
      )}

      {/* Footer */}
      <Footer />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

function LoadingState({ changingProfile }: { changingProfile: boolean }) {
  return (
    <div className="ott-loading-container" aria-live="polite">
      <div className="loading-ambient-bg" />
      <div className="loading-card-box">
        <div className="loading-spinner-ring">
          <Sparkles size={26} />
        </div>
        <h2>{changingProfile ? '맞춤 편성을 준비하고 있습니다...' : '콘텐츠를 불러오는 중입니다'}</h2>
        <p>회원님의 취향에 맞춘 추천 컬렉션을 구성하고 있습니다.</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ott-error-container" role="alert">
      <div className="error-icon-circle">
        <AlertCircle size={28} />
      </div>
      <h2>연결에 실패했습니다</h2>
      <p>{message}</p>
      <button type="button" className="ott-btn ott-btn-primary" onClick={onRetry}>
        <RotateCcw size={15} /> 다시 시도
      </button>
    </div>
  );
}
