'use client';

import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

interface AnalyzeButtonProps {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}

export default function AnalyzeButton({ onClick, disabled, loading }: AnalyzeButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      size="lg"
      className="w-full sm:w-auto min-w-[200px] bg-primary hover:bg-primary/90"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Analyzing...
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-5 w-5" />
          Analyze Code
        </>
      )}
    </Button>
  );
}
