/* ==========================================================================
   Disha Security: Rate Limiting & Brute-Force Defense Engine
   ==========================================================================
   Enforces:
   - Login & OTP attempts: Max 5 attempts per 60 seconds
   - Password / Passcode resets: Max 3 attempts per 60 minutes
   ========================================================================== */

const RATE_LIMITS = {
  OTP_SEND: { max: 5, windowMs: 60 * 1000, name: 'OTP requests' },
  OTP_VERIFY: { max: 5, windowMs: 60 * 1000, name: 'OTP verification' },
  ADMIN_LOGIN: { max: 5, windowMs: 60 * 1000, name: 'Admin authentication' },
  PASSWORD_RESET: { max: 3, windowMs: 60 * 60 * 1000, name: 'Password changes' }
};

class RateLimiterManager {
  constructor() {
    this.storagePrefix = 'disha_ratelimit_';
  }

  /**
   * Checks if an action is allowed or currently throttled
   * @param {string} actionKey Key from RATE_LIMITS (e.g. 'OTP_SEND', 'ADMIN_LOGIN')
   * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
   */
  check(actionKey) {
    const config = RATE_LIMITS[actionKey] || { max: 5, windowMs: 60 * 1000, name: 'Requests' };
    const key = this.storagePrefix + actionKey;
    const now = Date.now();

    let record = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) record = JSON.parse(raw);
    } catch {
      record = null;
    }

    if (!record || now > record.resetTime) {
      return { allowed: true, remaining: config.max, retryAfterSec: 0 };
    }

    if (record.count >= config.max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
    }

    return { allowed: true, remaining: config.max - record.count, retryAfterSec: 0 };
  }

  /**
   * Records an attempt for the specified action
   * @param {string} actionKey Key from RATE_LIMITS
   * @returns {{ allowed: boolean, retryAfterSec: number }}
   */
  consume(actionKey) {
    const config = RATE_LIMITS[actionKey] || { max: 5, windowMs: 60 * 1000, name: 'Requests' };
    const key = this.storagePrefix + actionKey;
    const now = Date.now();

    let record = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) record = JSON.parse(raw);
    } catch {
      record = null;
    }

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + config.windowMs };
    } else {
      record.count += 1;
    }

    localStorage.setItem(key, JSON.stringify(record));

    if (record.count > config.max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
    }

    return { allowed: true, retryAfterSec: 0 };
  }

  /**
   * Clears the rate limit counter upon successful authentication
   * @param {string} actionKey Key from RATE_LIMITS
   */
  reset(actionKey) {
    const key = this.storagePrefix + actionKey;
    localStorage.removeItem(key);
  }
}

export const RateLimiter = new RateLimiterManager();
