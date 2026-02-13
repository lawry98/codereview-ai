// Core analysis types
export interface AnalysisItem {
  severity: 'critical' | 'warning' | 'info';
  line: number | null;
  issue: string;
  suggestion: string;
  fixedCode: string | null;
}

export interface AnalysisResponse {
  summary: string;
  overallScore: number;
  categories: {
    bugs: AnalysisItem[];
    security: AnalysisItem[];
    performance: AnalysisItem[];
    bestPractices: AnalysisItem[];
    refactoring: AnalysisItem[];
  };
  improvedCode: string | null;
}

// Database types
export interface Review {
  id: string;
  user_id: string | null;
  code: string;
  language: string;
  analysis: AnalysisResponse;
  overall_score: number;
  is_public: boolean;
  created_at: string;
}

// API request/response types
export interface AnalyzeRequest {
  code: string;
  language: string;
}

export interface AnalyzeResponse extends AnalysisResponse {}

export interface SaveReviewRequest {
  code: string;
  language: string;
  analysis: AnalysisResponse;
  overallScore: number;
}

export interface SaveReviewResponse {
  id: string;
  created_at: string;
}

// UI types
export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'kotlin';

export interface LanguageOption {
  value: SupportedLanguage;
  label: string;
  prismLang: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { value: 'javascript', label: 'JavaScript', prismLang: 'javascript' },
  { value: 'typescript', label: 'TypeScript', prismLang: 'typescript' },
  { value: 'python', label: 'Python', prismLang: 'python' },
  { value: 'java', label: 'Java', prismLang: 'java' },
  { value: 'cpp', label: 'C++', prismLang: 'cpp' },
  { value: 'go', label: 'Go', prismLang: 'go' },
  { value: 'rust', label: 'Rust', prismLang: 'rust' },
  { value: 'csharp', label: 'C#', prismLang: 'csharp' },
  { value: 'php', label: 'PHP', prismLang: 'php' },
  { value: 'ruby', label: 'Ruby', prismLang: 'ruby' },
  { value: 'swift', label: 'Swift', prismLang: 'swift' },
  { value: 'kotlin', label: 'Kotlin', prismLang: 'kotlin' },
];

// Auth types
export interface User {
  id: string;
  email?: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
  };
}
