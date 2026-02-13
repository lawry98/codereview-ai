/**
 * Simple in-memory rate limiter for API requests
 * Tracks usage by IP address (unauthenticated) or user ID (authenticated)
 */

interface RateLimitEntry {
  count: number;
  date: string; // Date string for daily reset (YYYY-MM-DD)
}

// In-memory store (fine for single-instance deployments like Vercel)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limits
const UNAUTHENTICATED_LIMIT = 3; // analyses per day
const AUTHENTICATED_LIMIT = 20; // analyses per day

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if a request should be rate limited
 * @param identifier - IP address or user ID
 * @param isAuthenticated - Whether the user is authenticated
 * @returns Object with allowed status and remaining count
 */
export function checkRateLimit(
  identifier: string,
  isAuthenticated: boolean = false
): { allowed: boolean; remaining: number; limit: number } {
  const limit = isAuthenticated ? AUTHENTICATED_LIMIT : UNAUTHENTICATED_LIMIT;
  const today = getTodayString();

  // Get or initialize entry
  const entry = rateLimitStore.get(identifier);

  // Reset if it's a new day
  if (!entry || entry.date !== today) {
    rateLimitStore.set(identifier, { count: 0, date: today });
    return { allowed: true, remaining: limit - 1, limit };
  }

  // Check if limit exceeded
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining: limit - entry.count - 1, limit };
}

/**
 * Increment the rate limit counter
 * @param identifier - IP address or user ID
 */
export function incrementRateLimit(identifier: string): void {
  const today = getTodayString();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.date !== today) {
    rateLimitStore.set(identifier, { count: 1, date: today });
  } else {
    entry.count += 1;
  }
}

/**
 * Get IP address from request headers
 * @param headers - Request headers
 */
export function getClientIdentifier(headers: Headers): string {
  // Try to get real IP from various headers (for deployments behind proxies)
  const forwardedFor = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  const cfConnectingIp = headers.get('cf-connecting-ip'); // Cloudflare

  if (forwardedFor) {
    // x-forwarded-for can be a comma-separated list, take the first one
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to a default if we can't determine IP
  return 'unknown-ip';
}

/**
 * Clean up old entries (optional, for memory management)
 * Call this periodically if needed
 */
export function cleanupOldEntries(): void {
  const today = getTodayString();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.date !== today) {
      rateLimitStore.delete(key);
    }
  }
}
