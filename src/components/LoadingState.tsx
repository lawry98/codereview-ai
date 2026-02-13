'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingState() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Score Bar Skeleton */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Cards Skeleton */}
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </CardHeader>
        </Card>
      ))}

      {/* Analyzing message */}
      <div className="text-center py-8">
        <div className="inline-flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 bg-primary rounded-full animate-bounce" />
          <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
          <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
          <span className="ml-2">Analyzing your code with AI...</span>
        </div>
      </div>
    </div>
  );
}
