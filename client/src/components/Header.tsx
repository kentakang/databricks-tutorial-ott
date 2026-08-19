import { Bell, Check, ChevronDown, Compass, Film, Flame, Search, Sparkles, Tv, UserCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatGenre, formatPlan, type UserSummary } from '../lib/ott-helpers.js';

interface HeaderProps {
  users: UserSummary[];
  selectedUserId: string;
  onUserChange: (value: string) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeNav: string;
  onNavChange: (nav: string) => void;
  wishlistCount: number;
}

const POPULAR_TAGS = ['#실시간TOP10', '#오리지널독점', '#SF블록버스터', '#평론가극찬', '#주말몰아보기'];

export function Header({
  users,
  selectedUserId,
  onUserChange,
  loading,
  searchQuery,
  onSearchChange,
  activeNav,
  onNavChange,
  wishlistCount,
}: HeaderProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedUser = users.find((user) => user.userId === selectedUserId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchToggle = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      return next;
    });
  };

  return (
    <header className="ott-header">
      <div className="header-inner">
        {/* Brand Logo */}
        <div className="brand-group">
          <a
            href="#top"
            className="brand-logo"
            onClick={(e) => {
              e.preventDefault();
              onNavChange('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <div className="logo-symbol" aria-hidden="true">
              <span className="bar bar-1" />
              <span className="bar bar-2" />
              <span className="bar bar-3" />
            </div>
            <div className="logo-text">
              <span className="brand-name">SceneFlow</span>
              <span className="brand-badge">시즌플로우</span>
            </div>
          </a>

          {/* GNB Navigation */}
          <nav className="gnb-nav" aria-label="메인 메뉴">
            <button
              type="button"
              className={`nav-item ${activeNav === 'home' ? 'active' : ''}`}
              onClick={() => {
                onNavChange('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              홈
            </button>
            <button
              type="button"
              className={`nav-item ${activeNav === 'series' ? 'active' : ''}`}
              onClick={() => onNavChange('series')}
            >
              <Tv size={15} />
              시리즈
            </button>
            <button
              type="button"
              className={`nav-item ${activeNav === 'movies' ? 'active' : ''}`}
              onClick={() => onNavChange('movies')}
            >
              <Film size={15} />
              영화
            </button>
            <button
              type="button"
              className={`nav-item ${activeNav === 'live' ? 'active' : ''}`}
              onClick={() => onNavChange('live')}
            >
              <Flame size={15} />
              실시간 인기
            </button>
            <button
              type="button"
              className={`nav-item ${activeNav === 'original' ? 'active' : ''}`}
              onClick={() => onNavChange('original')}
            >
              <Compass size={15} />
              오리지널
            </button>
            <button
              type="button"
              className={`nav-item ${activeNav === 'my' ? 'active' : ''}`}
              onClick={() => onNavChange('my')}
            >
              MY {wishlistCount > 0 && <span className="nav-count">{wishlistCount}</span>}
            </button>
          </nav>
        </div>

        {/* Right Section */}
        <div className="header-actions">
          {/* Search bar */}
          <div className={`search-container ${searchOpen || searchQuery ? 'open' : ''}`}>
            <button
              type="button"
              className="search-toggle-btn"
              onClick={handleSearchToggle}
              aria-label="검색창 열기/닫기"
            >
              <Search size={18} />
            </button>
            <div className="search-input-wrapper">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="제목, 장르, 감독, 키워드 검색"
                aria-label="작품 검색"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => onSearchChange('')}
                  aria-label="검색어 지우기"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Popular Keywords (Desktop only) */}
          <div className="popular-tags-bar" aria-label="추천 검색어">
            {POPULAR_TAGS.slice(0, 3).map((tag) => (
              <button key={tag} type="button" className="tag-pill" onClick={() => onSearchChange(tag.replace('#', ''))}>
                {tag}
              </button>
            ))}
          </div>

          {/* Notification Icon */}
          <button
            type="button"
            className="icon-action-btn"
            aria-label="알림"
            title="새로운 AI 추천 테마가 업데이트되었습니다."
          >
            <Bell size={18} />
            <span className="notif-dot" />
          </button>

          {/* Profile & Persona Switcher (Korean OTT style) */}
          <div className="profile-dropdown-wrapper" ref={profileRef}>
            <button
              type="button"
              className={`profile-button ${profileMenuOpen ? 'active' : ''}`}
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              aria-expanded={profileMenuOpen}
              aria-label="프로필 및 시연 사용자 전환"
            >
              <div className="profile-avatar">{selectedUser ? selectedUser.displayName.slice(0, 1) : 'U'}</div>
              <div className="profile-info-text">
                <span className="profile-name">{selectedUser?.displayName ?? '사용자'}</span>
                <span className="profile-plan">
                  {selectedUser ? formatPlan(selectedUser.subscriptionPlan) : '이용권'}
                </span>
              </div>
              <ChevronDown size={14} className={`profile-chevron ${profileMenuOpen ? 'rotated' : ''}`} />
            </button>

            {/* Profile Dropdown Menu */}
            {profileMenuOpen && (
              <div className="profile-menu-popover" role="menu">
                <div className="popover-header">
                  <div className="demo-notice-badge">
                    <Sparkles size={12} /> Databricks AI 개인화 시연
                  </div>
                  <p className="popover-desc">
                    시연 대상 페르소나를 변경하면 Databricks 모델이 실시간으로 홈 구성을 재편성합니다.
                  </p>
                </div>

                <div className="persona-list" role="group" aria-label="데모 페르소나 선택">
                  {loading ? (
                    <div className="popover-loading">페르소나 목록 로딩 중...</div>
                  ) : (
                    users.map((user) => {
                      const isCurrent = user.userId === selectedUserId;
                      return (
                        <button
                          key={user.userId}
                          type="button"
                          className={`persona-item ${isCurrent ? 'selected' : ''}`}
                          onClick={() => {
                            onUserChange(user.userId);
                            setProfileMenuOpen(false);
                          }}
                        >
                          <div className="persona-avatar">{user.displayName.slice(0, 1)}</div>
                          <div className="persona-meta">
                            <strong className="persona-name">{user.displayName} 님</strong>
                            <span className="persona-pref">
                              선호: {formatGenre(user.preferredGenre)} · {formatPlan(user.subscriptionPlan)}
                            </span>
                          </div>
                          {isCurrent && <Check size={16} className="check-icon" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="popover-footer">
                  <div className="ai-engine-tag">
                    <UserCheck size={13} />
                    <span>Lakehouse Behavioral Lineage Active</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
