/**
 * Authentication via HTTP callback to rvn-web with in-memory cache
 */

import type { AuthUser, VerifyTokenResponse, VerifyTicketAccessResponse } from './types';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// Cache: tokenHash -> { user, expires }
const tokenCache = new Map<string, { user: AuthUser; expires: number }>();
const TOKEN_CACHE_TTL = 60_000; // 60 seconds

// Cache: ticketAccess -> { allowed, expires }
const ticketAccessCache = new Map<string, { allowed: boolean; expires: number }>();
const TICKET_ACCESS_CACHE_TTL = 30_000; // 30 seconds

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokenCache.entries()) {
    if (now > val.expires) tokenCache.delete(key);
  }
  for (const [key, val] of ticketAccessCache.entries()) {
    if (now > val.expires) ticketAccessCache.delete(key);
  }
}, 5 * 60_000);

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface VerifyTokenParams {
  token: string;
  sessionId: string;
  tokenFromCookie: string;
  ip: string;
  userAgent: string;
}

/**
 * Verify a user token by calling rvn-web internal API.
 * Results are cached by token hash for TOKEN_CACHE_TTL.
 */
export async function verifyToken(params: VerifyTokenParams): Promise<AuthUser | null> {
  const tokenHash = await hashToken(params.token);

  // Check cache
  const cached = tokenCache.get(tokenHash);
  if (cached && Date.now() < cached.expires) {
    return cached.user;
  }

  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api/internal/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as VerifyTokenResponse;
    if (!data.valid || !data.user) return null;

    // Cache successful result
    tokenCache.set(tokenHash, { user: data.user, expires: Date.now() + TOKEN_CACHE_TTL });
    return data.user;
  } catch {
    console.error('[auth] Failed to verify token via callback');
    return null;
  }
}

/**
 * Verify ticket access by calling rvn-web internal API.
 * Results are cached for TICKET_ACCESS_CACHE_TTL.
 */
export async function verifyTicketAccess(
  ticketId: string,
  userId: string,
  isSupport: boolean,
): Promise<boolean> {
  // Support can access any ticket
  if (isSupport) return true;

  const cacheKey = `${ticketId}:${userId}`;
  const cached = ticketAccessCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.allowed;
  }

  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api/internal/verify-ticket-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({ ticketId, userId, isSupport }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as VerifyTicketAccessResponse;
    ticketAccessCache.set(cacheKey, {
      allowed: data.allowed,
      expires: Date.now() + TICKET_ACCESS_CACHE_TTL,
    });
    return data.allowed;
  } catch {
    console.error('[auth] Failed to verify ticket access via callback');
    return false;
  }
}

/** Invalidate token cache for a specific user (on disconnect) */
export function invalidateUserCache(userId: string): void {
  for (const [key, val] of tokenCache.entries()) {
    if (val.user.id === userId) tokenCache.delete(key);
  }
}
