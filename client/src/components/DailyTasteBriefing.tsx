import { BarChart3, CheckCircle2, Film, Sparkles, Star } from 'lucide-react';
import type { HomeFeed } from '../../../shared/domain.js';
import { formatGenre } from '../lib/ott-helpers.js';

interface DailyTasteBriefingProps {
  feed: HomeFeed;
}

export function DailyTasteBriefing({ feed }: DailyTasteBriefingProps) {
  const { profile, tasteSummary, aiCuration } = feed;

  return (
    <section className="taste-briefing-card" aria-label="오늘의 맞춤 편성 브리핑">
      <div className="briefing-left">
        <div className="briefing-icon-wrapper">
          <Sparkles size={22} className="briefing-icon" />
        </div>
        <div className="briefing-text">
          <div className="briefing-badge-row">
            <span className="briefing-kicker">{"TODAY'S AI CURATION"}</span>
            <span className={`ai-status-badge ${aiCuration.source}`}>
              <CheckCircle2 size={12} />
              {aiCuration.source === 'foundation-model'
                ? 'Databricks Foundation Model 큐레이션 완료'
                : aiCuration.source === 'ai-pending'
                  ? 'AI 추천 큐레이션 최적화 진행 중'
                  : '취향 알고리즘 편성'}
            </span>
          </div>
          <h2 className="briefing-headline">{tasteSummary.headline}</h2>
          <p className="briefing-details">{tasteSummary.details}</p>
        </div>
      </div>

      {/* User Taste Profile Badges */}
      <div className="briefing-stats">
        <div className="stat-pill">
          <Film size={14} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-label">시청 완료</span>
            <strong className="stat-val">{tasteSummary.watchedTitles}편</strong>
          </div>
        </div>
        <div className="stat-pill">
          <Star size={14} className="stat-icon star" />
          <div className="stat-content">
            <span className="stat-label">별점 평가</span>
            <strong className="stat-val">{tasteSummary.ratedTitles}건</strong>
          </div>
        </div>
        <div className="stat-pill">
          <BarChart3 size={14} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-label">선호 장르</span>
            <strong className="stat-val">{formatGenre(profile.preferredGenre)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
