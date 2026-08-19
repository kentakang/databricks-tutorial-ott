import { Sparkles } from 'lucide-react';
import type { HomeFeed } from '../../../shared/domain.js';
import { formatGenre } from '../lib/ott-helpers.js';

interface DailyTasteBriefingProps {
  feed: HomeFeed;
}

export function DailyTasteBriefing({ feed }: DailyTasteBriefingProps) {
  const { profile, tasteSummary } = feed;

  return (
    <section className="taste-briefing-bar" aria-label="오늘의 맞춤 편성">
      <div className="briefing-bar-inner">
        <span className="briefing-sparkle">
          <Sparkles size={14} />
        </span>
        <p className="briefing-summary-text">
          <strong>{profile.displayName}</strong> 님을 위한 맞춤 추천 · <span>{tasteSummary.headline}</span>
          <span className="briefing-genre-badge">{formatGenre(profile.preferredGenre)}</span>
        </p>
      </div>
    </section>
  );
}
