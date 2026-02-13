'use client';

import { getScoreColor, getScoreBgColor } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-12 w-12 text-lg',
    lg: 'h-16 w-16 text-2xl',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full border flex items-center justify-center font-bold ${getScoreBgColor(
        score
      )} ${getScoreColor(score)}`}
    >
      {score}
    </div>
  );
}

interface ScoreBarProps {
  score: number;
  summary: string;
}

export function ScoreBar({ score, summary }: ScoreBarProps) {
  return (
    <div className="flex items-center gap-4 p-6 bg-card border border-border rounded-lg">
      <ScoreBadge score={score} size="lg" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold">Overall Score</h3>
          <Badge variant="outline" className={getScoreColor(score)}>
            {score >= 8 ? 'Excellent' : score >= 5 ? 'Good' : 'Needs Improvement'}
          </Badge>
        </div>
        <p className="text-muted-foreground">{summary}</p>
      </div>
    </div>
  );
}
