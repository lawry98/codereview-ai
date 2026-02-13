'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AnalysisItem } from '@/types';
import { getSeverityColor, copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';

interface CategoryCardProps {
  title: string;
  icon: string;
  items: AnalysisItem[];
  defaultOpen?: boolean;
}

export default function CategoryCard({
  title,
  icon,
  items,
  defaultOpen = true,
}: CategoryCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (item: AnalysisItem, index: number) => {
    const textToCopy = `${item.suggestion}${
      item.fixedCode ? `\n\n\`\`\`\n${item.fixedCode}\n\`\`\`` : ''
    }`;

    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopiedIndex(index);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      toast.error('Failed to copy');
    }
  };

  // Get worst severity for badge
  const worstSeverity = items.reduce<'critical' | 'warning' | 'info' | null>(
    (worst, item) => {
      if (item.severity === 'critical') return 'critical';
      if (item.severity === 'warning' && worst !== 'critical') return 'warning';
      if (!worst) return item.severity;
      return worst;
    },
    null
  );

  if (items.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{icon}</span>
              <span>{title}</span>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
              No issues ✓
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-2xl">{icon}</span>
            <span>{title}</span>
            <Badge variant="outline" className="ml-2">
              {items.length} {items.length === 1 ? 'issue' : 'issues'}
            </Badge>
          </div>
          {worstSeverity && (
            <Badge variant="outline" className={getSeverityColor(worstSeverity)}>
              {worstSeverity}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0 space-y-4">
          {items.map((item, index) => (
            <div key={index}>
              {index > 0 && <Separator className="mb-4" />}
              <div className="space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getSeverityColor(item.severity)}>
                      {item.severity}
                    </Badge>
                    {item.line && (
                      <Badge variant="outline" className="text-xs">
                        Line {item.line}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(item, index)}
                    className="h-7 px-2"
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                {/* Issue */}
                <div>
                  <p className="font-medium text-sm mb-1">Issue:</p>
                  <p className="text-sm text-muted-foreground">{item.issue}</p>
                </div>

                {/* Suggestion */}
                <div>
                  <p className="font-medium text-sm mb-1">Suggestion:</p>
                  <p className="text-sm text-muted-foreground">{item.suggestion}</p>
                </div>

                {/* Fixed Code */}
                {item.fixedCode && (
                  <div>
                    <p className="font-medium text-sm mb-1">Fix:</p>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto border border-border">
                      <code>{item.fixedCode}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
