import { parseRating } from '../lib/ott-helpers.js';

interface RatingBadgeProps {
  rating?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function RatingBadge({ rating, size = 'sm', showText = false }: RatingBadgeProps) {
  const { code, label, fullLabel } = parseRating(rating);

  return (
    <span className={`rating-badge rating-${code.toLowerCase()} size-${size}`} title={fullLabel} aria-label={fullLabel}>
      <span className="rating-code">{label}</span>
      {showText && <span className="rating-text">{fullLabel}</span>}
    </span>
  );
}
