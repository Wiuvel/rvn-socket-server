/**
 * Rate limiting for connection attempts and typing events
 */

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
}

interface TypingRecord {
  lastEmit: number;
  count: number;
}

const MAX_CONNECTION_ATTEMPTS = 5;
const CONNECTION_ATTEMPT_WINDOW = 60_000; // 1 min
const CONNECTION_ATTEMPT_BAN_TIME = 300_000; // 5 min

const TYPING_RATE_LIMIT_MS = 1_000;
const TYPING_RATE_LIMIT_COUNT = 10; // per minute

const connectionAttempts = new Map<string, AttemptRecord>();
const typingRateLimits = new Map<string, TypingRecord>();

/**
 * Check and record a connection attempt. Returns error message if blocked, null if allowed.
 */
export function checkConnectionAttempt(ip: string, type: 'no-token' | 'invalid-token'): string | null {
  const now = Date.now();
  const key = `${type}:${ip}`;
  const attempts = connectionAttempts.get(key);

  if (attempts) {
    if (now - attempts.firstAttempt < CONNECTION_ATTEMPT_BAN_TIME && attempts.count >= MAX_CONNECTION_ATTEMPTS) {
      return type === 'no-token' ? 'Too many connection attempts' : 'Too many invalid token attempts';
    }
    if (now - attempts.firstAttempt > CONNECTION_ATTEMPT_WINDOW) {
      connectionAttempts.delete(key);
    } else {
      attempts.count++;
      attempts.lastAttempt = now;
    }
  } else {
    connectionAttempts.set(key, { count: 1, firstAttempt: now, lastAttempt: now });
  }

  // Clean old entries
  if (connectionAttempts.size > 1000) {
    for (const [k, v] of connectionAttempts.entries()) {
      if (now - v.lastAttempt > CONNECTION_ATTEMPT_WINDOW * 2) {
        connectionAttempts.delete(k);
      }
    }
  }

  return null;
}

/** Get current attempt count for logging */
export function getAttemptCount(ip: string, type: 'no-token' | 'invalid-token'): number {
  return connectionAttempts.get(`${type}:${ip}`)?.count ?? 0;
}

/** Clear rate limit records for a successfully authenticated IP */
export function clearConnectionAttempts(ip: string): void {
  connectionAttempts.delete(`no-token:${ip}`);
  connectionAttempts.delete(`invalid-token:${ip}`);
}

/**
 * Check typing rate limit. Returns true if the event should be allowed.
 */
export function checkTypingRateLimit(socketId: string, ticketId: string, userId: string): boolean {
  const key = `${socketId}:${ticketId}:${userId}`;
  const now = Date.now();
  const limit = typingRateLimits.get(key);

  if (limit) {
    const elapsed = now - limit.lastEmit;
    if (elapsed < TYPING_RATE_LIMIT_MS) return false;
    if (limit.count >= TYPING_RATE_LIMIT_COUNT && elapsed < 60_000) return false;
    limit.lastEmit = now;
    limit.count = elapsed < 60_000 ? limit.count + 1 : 1;
  } else {
    typingRateLimits.set(key, { lastEmit: now, count: 1 });
  }

  // Cleanup
  if (typingRateLimits.size > 500) {
    for (const [k, v] of typingRateLimits.entries()) {
      if (now - v.lastEmit > 120_000) typingRateLimits.delete(k);
    }
  }

  return true;
}

/** Clean up typing rate limits for a disconnected socket */
export function cleanupSocketRateLimits(socketId: string): void {
  for (const key of typingRateLimits.keys()) {
    if (key.startsWith(`${socketId}:`)) typingRateLimits.delete(key);
  }
}
