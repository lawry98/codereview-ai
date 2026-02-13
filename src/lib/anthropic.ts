import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client (server-side only)
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Claude model to use
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Default generation parameters
export const DEFAULT_GENERATION_CONFIG = {
  model: CLAUDE_MODEL,
  max_tokens: 4096,
  temperature: 0.3,
} as const;
