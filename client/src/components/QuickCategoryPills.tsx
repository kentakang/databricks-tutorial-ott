import { Compass, Film, Flame, History, Sparkles, Star } from 'lucide-react';

interface QuickCategoryPillsProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  hasContinueWatching: boolean;
}

export function QuickCategoryPills({ activeCategory, onSelectCategory, hasContinueWatching }: QuickCategoryPillsProps) {
  const categories = [
    { id: 'all', label: '전체', icon: Film },
    { id: 'top10', label: '실시간 TOP 10', icon: Flame },
    { id: 'ai-themes', label: 'AI 맞춤 테마', icon: Sparkles },
    { id: 'original', label: '독점 오리지널', icon: Compass },
    ...(hasContinueWatching ? [{ id: 'continue', label: '이어보기', icon: History }] : []),
    { id: 'critics', label: '평론가 극찬작', icon: Star },
  ];

  return (
    <div className="quick-category-container" aria-label="콘텐츠 빠른 탐색">
      <div className="category-pills-list">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={`category-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat.id)}
            >
              <Icon size={14} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
