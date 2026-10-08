import { NextRequest, NextResponse } from 'next/server';
import { anthropic, DEFAULT_GENERATION_CONFIG } from '@/lib/anthropic';
import { generateCodeReviewPrompt } from '@/prompts/codeReview';
import { checkRateLimit, incrementRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { SUPPORTED_LANGUAGES, AnalysisResponse } from '@/types';

const MAX_CODE_LENGTH = 10000;

/**
 * POST /api/analyze
 * Analyzes code using Claude AI
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { code, language } = body;

    // Validation
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 }
      );
    }

    if (code.length > MAX_CODE_LENGTH) {
      return NextResponse.json(
        { error: `Code must be ${MAX_CODE_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    if (code.trim().length === 0) {
      return NextResponse.json({ error: 'Code cannot be empty' }, { status: 400 });
    }

    if (!language || typeof language !== 'string') {
      return NextResponse.json(
        { error: 'Language is required and must be a string' },
        { status: 400 }
      );
    }

    // Check if language is supported
    const isValidLanguage = SUPPORTED_LANGUAGES.some((lang) => lang.value === language);
    if (!isValidLanguage) {
      return NextResponse.json(
        { error: 'Invalid language. Must be one of: ' + SUPPORTED_LANGUAGES.map((l) => l.value).join(', ') },
        { status: 400 }
      );
    }

    // Rate limiting
    const clientId = getClientIdentifier(request.headers);
    // TODO: Check if user is authenticated (Phase 3)
    const isAuthenticated = false;

    const rateLimit = checkRateLimit(clientId, isAuthenticated);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: isAuthenticated
            ? 'Daily limit reached. You can analyze up to 20 code samples per day.'
            : 'Daily limit reached. Sign in to get 20 analyses per day, or try again tomorrow.',
          limit: rateLimit.limit,
          remaining: 0,
        },
        { status: 429 }
      );
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set');
      return NextResponse.json(
        { error: 'Service configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    // Generate prompt
    const prompt = generateCodeReviewPrompt(code, language);

    // Call Claude API
    let response;
    try {
      response = await anthropic.messages.create({
        ...DEFAULT_GENERATION_CONFIG,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });
    } catch (error: any) {
      console.error('Anthropic API error:', error);

      // Handle specific API errors
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'API authentication failed. Please contact support.' },
          { status: 500 }
        );
      }

      if (error.status === 429) {
        return NextResponse.json(
          { error: 'AI service is currently busy. Please try again in a moment.' },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to analyze code. Please try again.' },
        { status: 500 }
      );
    }

    // Extract the text block (adaptive thinking puts a thinking block first)
    const content = response.content.find((block) => block.type === 'text');
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    let analysisText = content.text;

    // Parse JSON response
    let analysis: AnalysisResponse;
    try {
      // Try to clean up markdown fences if present
      const cleanedJson = analysisText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      analysis = JSON.parse(cleanedJson);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', analysisText);

      // Retry once with a simpler approach
      try {
        // Try to extract JSON from the response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (retryError) {
        console.error('Retry parse failed:', retryError);
        return NextResponse.json(
          { error: 'Failed to parse AI response. Please try again.' },
          { status: 500 }
        );
      }
    }

    // Validate response structure
    if (
      !analysis ||
      typeof analysis.overallScore !== 'number' ||
      !analysis.summary ||
      !analysis.categories
    ) {
      console.error('Invalid analysis structure:', analysis);
      return NextResponse.json(
        { error: 'Received invalid response from AI. Please try again.' },
        { status: 500 }
      );
    }

    // Increment rate limit counter (only after successful analysis)
    incrementRateLimit(clientId);

    // Return analysis with rate limit info
    return NextResponse.json(
      {
        ...analysis,
        rateLimit: {
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in analyze endpoint:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
