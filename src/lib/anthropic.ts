import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client (server-side only)
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Claude model to use
export const CLAUDE_MODEL = 'claude-opus-5-5';

// Default generation parameters. Opus 5.5 rejects `temperature`, and its
// thinking tokens count toward `max_tokens`, so leave room for both.
export const DEFAULT_GENERATION_CONFIG = {
  model: CLAUDE_MODEL,
  max_tokens: 16000,
} as const;
