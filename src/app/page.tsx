'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { SupportedLanguage, AnalysisResponse } from '@/types';
import LanguageSelector from '@/components/LanguageSelector';
import AnalyzeButton from '@/components/AnalyzeButton';
import AnalysisResults from '@/components/AnalysisResults';
import LoadingState from '@/components/LoadingState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamically import CodeEditor to avoid SSR issues with Prism
const CodeEditor = dynamic(() => import('@/components/CodeEditor'), {
  ssr: false,
  loading: () => <Skeleton className="min-h-[300px] w-full rounded-lg" />,
});

export default function Home() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('javascript');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    // Validation
    if (code.trim().length === 0) {
      toast.error('Please enter some code to analyze');
      return;
    }

    if (code.length > 10000) {
      toast.error('Code must be 10,000 characters or less');
      return;
    }

    // Reset state
    setError(null);
    setAnalysis(null);
    setLoading(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle rate limit
        if (response.status === 429) {
          setError(data.error);
          toast.error('Rate limit reached');
          return;
        }

        // Handle other errors
        setError(data.error || 'Failed to analyze code');
        toast.error(data.error || 'Something went wrong');
        return;
      }

      // Success
      setAnalysis(data);
      toast.success('Analysis complete!');

      // Show rate limit info
      if (data.rateLimit) {
        const { remaining, limit } = data.rateLimit;
        if (remaining <= 2) {
          toast.info(`${remaining} analysis${remaining !== 1 ? 'es' : ''} remaining today`);
        }
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Failed to connect to the server. Please try again.');
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            CodeReview AI
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Get instant AI-powered feedback on your code
          </p>
        </div>

        {/* Main Content */}
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Auth Banner */}
          <Alert className="bg-card border-border">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>{' '}
              to save your reviews and get 20 analyses per day (vs 3 for guests)
            </AlertDescription>
          </Alert>

          {/* Editor Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your Code</h2>
              <LanguageSelector value={language} onChange={setLanguage} />
            </div>

            <CodeEditor
              value={code}
              onChange={setCode}
              language={language}
              placeholder={`// Paste your ${language} code here...\n// The AI will analyze it for bugs, security issues, performance, and more!`}
            />

            <div className="flex justify-center">
              <AnalyzeButton
                onClick={handleAnalyze}
                disabled={code.trim().length === 0 || code.length > 10000}
                loading={loading}
              />
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {loading && <LoadingState />}

          {/* Results */}
          {!loading && analysis && <AnalysisResults analysis={analysis} />}
        </div>
      </div>
    </div>
  );
}
