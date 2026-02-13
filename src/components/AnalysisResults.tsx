'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { AnalysisResponse } from '@/types';
import { ScoreBar } from '@/components/ScoreBadge';
import CategoryCard from '@/components/CategoryCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';

interface AnalysisResultsProps {
  analysis: AnalysisResponse;
}

const CATEGORY_CONFIG = {
  bugs: { title: 'Bugs', icon: '🐛' },
  security: { title: 'Security', icon: '🔒' },
  performance: { title: 'Performance', icon: '⚡' },
  bestPractices: { title: 'Best Practices', icon: '📝' },
  refactoring: { title: 'Refactoring', icon: '♻️' },
};

export default function AnalysisResults({ analysis }: AnalysisResultsProps) {
  const [improvedCodeOpen, setImprovedCodeOpen] = useState(false);
  const [copiedImproved, setCopiedImproved] = useState(false);

  const handleCopyImproved = async () => {
    if (!analysis.improvedCode) return;

    const success = await copyToClipboard(analysis.improvedCode);
    if (success) {
      setCopiedImproved(true);
      toast.success('Improved code copied!');
      setTimeout(() => setCopiedImproved(false), 2000);
    } else {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overall Score */}
      <ScoreBar score={analysis.overallScore} summary={analysis.summary} />

      {/* Category Cards */}
      <div className="grid gap-4">
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
          const items = analysis.categories[key as keyof typeof analysis.categories];
          return (
            <CategoryCard
              key={key}
              title={config.title}
              icon={config.icon}
              items={items}
              defaultOpen={items.length > 0}
            />
          );
        })}
      </div>

      {/* Improved Code */}
      {analysis.improvedCode && (
        <Card className="bg-card border-border">
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setImprovedCodeOpen(!improvedCodeOpen)}
          >
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {improvedCodeOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-2xl">✨</span>
                <span>Improved Code</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyImproved();
                }}
                className="h-8 px-3"
              >
                {copiedImproved ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </CardTitle>
          </CardHeader>

          {improvedCodeOpen && (
            <CardContent className="pt-0">
              <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto border border-border custom-scrollbar max-h-[500px]">
                <code>{analysis.improvedCode}</code>
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
