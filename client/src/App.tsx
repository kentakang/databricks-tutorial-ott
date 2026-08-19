import { AlertCircle, Bookmark, RotateCcw, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { HomeFeed, MovieCard as MovieCardType } from '../../shared/domain.js';
import { DailyTasteBriefing } from './components/DailyTasteBriefing.js';
import { Footer } from './components/Footer.js';
import { Header } from './components/Header.js';
import { HeroBillboard } from './components/HeroBillboard.js';
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
    showToast(`〈${movie.title}〉 초고화질 스트리밍 재생을 시작합니다.`, 'play');
  };

  const handleSelectUser = (userId: string) => {
    setError(null);
    setLoadingFeed(true);
    setSelectedMovie(null);
    setSelectedUserId(userId);
    const user = users.find((u) => u.userId === userId);
    if (user) {
      showToast(`${user.displayName} 님 프로필로 전환되었습니다.`, 'info');
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
      {/* Korean OTT Header */}
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
          {/* Active Navigation: MY (찜 목록) */}
          {activeNav === 'my' ? (
            <div className="my-list-page">
              <div className="my-list-header">
                <div className="my-title-row">
                  <Bookmark size={24} className="my-icon" />
                  <h2>내가 찜한 콘텐츠 (MY)</h2>
                </div>
                <p>
                  {feed.profile.displayName} 님이 보고 싶어서 저장해 둔 작품 목록입니다 ({wishlistedMovies.length}편).
                </p>
              </div>
              {wishlistedMovies.length > 0 ? (
                <div className="my-grid">
                  {wishlistedMovies.map((movie) => (
                    <div key={movie.movieId} className="my-grid-item">
                      <MovieRail
                        id={`my-item-${movie.movieId}`}
                        title=""
                        movies={[movie]}
                        onSelect={setSelectedMovie}
                        onPlay={handlePlay}
                        wishlistIds={wishlistIds}
                        onToggleWishlist={toggleWishlist}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="my-empty-state">
                  <Bookmark size={40} />
                  <h3>아직 찜한 콘텐츠가 없어요</h3>
                  <p>마음에 드는 작품 카드의 &apos;+ 찜하기&apos; 버튼을 눌러 나만의 보관함을 만들어 보세요.</p>
                  <button type="button" className="ott-btn ott-btn-primary" onClick={() => setActiveNav('home')}>
                    추천 홈으로 이동
                  </button>
                </div>
              )}
            </div>
          ) : searchQuery.trim().length >= 2 ? (
            /* Search Results View */
            <div className="search-results-page">
              <div className="search-header">
                <h2>
                  <Search size={22} /> “{searchQuery.trim()}” 검색 결과
                </h2>
                <p>총 {searchResults.length}개의 작품이 검색되었습니다.</p>
              </div>
              {searchResults.length > 0 ? (
                <MovieRail
                  id="search-rail"
                  title="검색된 작품"
                  movies={searchResults}
                  onSelect={setSelectedMovie}
                  onPlay={handlePlay}
                  wishlistIds={wishlistIds}
                  onToggleWishlist={toggleWishlist}
                  showMatch
                />
              ) : (
                <div className="search-empty-state">
                  <Search size={36} />
                  <p>일치하는 작품을 찾지 못했습니다. 다른 키워드로 검색해 보세요.</p>
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

              {/* Today's Personalized Taste Briefing Banner */}
              <DailyTasteBriefing feed={feed} />

              {/* OTT Multi-Rail Carousel Section */}
              <div className="ott-rails-stack">
                {/* 1. Realtime TOP 10 Ranking Rail */}
                <MovieRail
                  id="trending-rail"
                  title="지금 대한민국 TOP 10 랭킹"
                  subtitle="실시간 완주율 · 평점 · 화제성을 종합한 인기 순위"
                  movies={feed.rails.trending}
                  onSelect={setSelectedMovie}
                  onPlay={handlePlay}
                  wishlistIds={wishlistIds}
                  onToggleWishlist={toggleWishlist}
                  numbered
                  badge="TOP 10"
                />

                {/* 2. AI Personalized Theme Rails (4 themes generated by Databricks Foundation Model) */}
                {feed.rails.aiThemes.map((theme, index) => (
                  <MovieRail
                    key={theme.themeId}
                    id={`ai-theme-${index}`}
                    title={theme.title}
                    subtitle={theme.subtitle}
                    movies={theme.movies}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    showMatch
                    badge={
                      feed.aiCuration.source === 'foundation-model'
                        ? 'AI 맞춤 테마'
                        : feed.aiCuration.source === 'ai-pending'
                          ? 'AI 분석 중'
                          : '취향 추천'
                    }
                  />
                ))}

                {/* 3. Continue Watching (if exists) */}
                {feed.rails.continueWatching.length > 0 && (
                  <MovieRail
                    id="continue-rail"
                    title={`${feed.profile.displayName} 님이 시청 중인 콘텐츠`}
                    subtitle="멈춘 장면부터 바로 이어서 시청해 보세요"
                    movies={feed.rails.continueWatching}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    showProgress
                    badge="이어보기"
                  />
                )}

                {/* 4. SceneFlow Originals Rail */}
                {originalMovies.length > 0 && (
                  <MovieRail
                    id="originals-rail"
                    title="오직 SceneFlow에서만! 독점 오리지널"
                    subtitle="극장에서 볼 수 없는 차별화된 오리지널 명작 라인업"
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
                    title="평론가들이 만점을 던진 인생 명작"
                    subtitle="검증된 전문 평론가 점수 80점 이상의 걸작 컬렉션"
                    movies={criticTopMovies}
                    onSelect={setSelectedMovie}
                    onPlay={handlePlay}
                    wishlistIds={wishlistIds}
                    onToggleWishlist={toggleWishlist}
                    badge="CRITIC'S CHOICE"
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

      {/* Korean OTT Footer */}
      <Footer />

      {/* Toast Alert */}
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
          <Sparkles size={28} />
        </div>
        <h2>
          {changingProfile
            ? 'Databricks AI가 새로운 맞춤 편성을 구성하는 중...'
            : 'SceneFlow 개인화 홈을 불러오는 중입니다'}
        </h2>
        <p>Unity Catalog 시청 이력과 Lakehouse 거버넌스 데이터를 분석하여 최적의 추천 테마를 편성하고 있습니다.</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ott-error-container" role="alert">
      <div className="error-icon-circle">
        <AlertCircle size={32} />
      </div>
      <h2>일시적으로 연결이 원활하지 않습니다</h2>
      <p>{message}</p>
      <button type="button" className="ott-btn ott-btn-primary" onClick={onRetry}>
        <RotateCcw size={16} /> 다시 연결하기
      </button>
    </div>
  );
}
