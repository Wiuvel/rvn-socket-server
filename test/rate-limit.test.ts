import { describe, it, expect, beforeEach } from 'bun:test';
import {
  checkConnectionAttempt,
  getAttemptCount,
  clearConnectionAttempts,
  checkTypingRateLimit,
  cleanupSocketRateLimits,
} from '../src/rate-limit';

describe('checkConnectionAttempt', () => {
  beforeEach(() => {
    clearConnectionAttempts('127.0.0.1');
  });

  it('allows first attempt', () => {
    expect(checkConnectionAttempt('127.0.0.1', 'no-token')).toBeNull();
  });

  it('tracks attempt count', () => {
    checkConnectionAttempt('127.0.0.1', 'no-token');
    checkConnectionAttempt('127.0.0.1', 'no-token');
    checkConnectionAttempt('127.0.0.1', 'no-token');
    expect(getAttemptCount('127.0.0.1', 'no-token')).toBe(3);
  });

  it('blocks after max attempts', () => {
    for (let i = 0; i < 5; i++) {
      checkConnectionAttempt('127.0.0.1', 'invalid-token');
    }
    const result = checkConnectionAttempt('127.0.0.1', 'invalid-token');
    expect(result).toBe('Too many invalid token attempts');
  });

  it('blocks no-token with correct message', () => {
    for (let i = 0; i < 5; i++) {
      checkConnectionAttempt('127.0.0.1', 'no-token');
    }
    const result = checkConnectionAttempt('127.0.0.1', 'no-token');
    expect(result).toBe('Too many connection attempts');
  });

  it('isolates IPs', () => {
    for (let i = 0; i < 5; i++) {
      checkConnectionAttempt('1.1.1.1', 'no-token');
    }
    expect(checkConnectionAttempt('2.2.2.2', 'no-token')).toBeNull();
  });

  it('clearConnectionAttempts resets counters', () => {
    for (let i = 0; i < 4; i++) {
      checkConnectionAttempt('127.0.0.1', 'no-token');
    }
    clearConnectionAttempts('127.0.0.1');
    expect(getAttemptCount('127.0.0.1', 'no-token')).toBe(0);
  });
});

describe('checkTypingRateLimit', () => {
  it('allows first typing event', () => {
    expect(checkTypingRateLimit('sock1', 'ticket1', 'user1')).toBe(true);
  });

  it('blocks rapid typing events', () => {
    checkTypingRateLimit('sock2', 'ticket1', 'user1');
    expect(checkTypingRateLimit('sock2', 'ticket1', 'user1')).toBe(false);
  });

  it('isolates different sockets', () => {
    checkTypingRateLimit('sockA', 'ticket1', 'user1');
    expect(checkTypingRateLimit('sockB', 'ticket1', 'user1')).toBe(true);
  });
});

describe('cleanupSocketRateLimits', () => {
  it('removes entries for disconnected socket', () => {
    checkTypingRateLimit('sockDC', 'ticket1', 'user1');
    cleanupSocketRateLimits('sockDC');
    // After cleanup, next call should be allowed immediately (fresh entry)
    expect(checkTypingRateLimit('sockDC', 'ticket1', 'user1')).toBe(true);
  });
});
