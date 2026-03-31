/**
 * ════════════════════════════════════════════════════════════════
 * RATE LIMITING MIDDLEWARE — IP-based + User-based rate limiting
 * OWASP Best Practice: Prevent abuse, DoS attacks, API exhaustion
 * ════════════════════════════════════════════════════════════════
 */

// In-memory store for rate limit tracking (use Redis in production)
const rateLimitStore = new Map();

/**
 * Clean up expired rate limit entries every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

/**
 * Extract client IP from request (handles proxies like Vercel)
 */
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
}

/**
 * Rate limiter function
 * @param {string} key - Unique identifier (IP, user ID, ticker, etc)
 * @param {number} maxRequests - Max requests allowed in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {object} {allowed: boolean, remaining: number, resetAt: timestamp}
 */
export function checkRateLimit(key, maxRequests = 100, windowMs = 900000) {
  const now = Date.now();

  if (!rateLimitStore.has(key)) {
    // First request in this window
    rateLimitStore.set(key, {
      requests: 1,
      resetAt: now + windowMs,
      startedAt: now,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  const data = rateLimitStore.get(key);

  // Check if window has expired
  if (data.resetAt < now) {
    // Window expired — reset
    rateLimitStore.set(key, {
      requests: 1,
      resetAt: now + windowMs,
      startedAt: now,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  // Still in same window — increment
  data.requests += 1;
  const remaining = Math.max(0, maxRequests - data.requests);
  const allowed = data.requests <= maxRequests;

  return {
    allowed,
    remaining,
    resetAt: data.resetAt,
    retryAfter: allowed ? null : Math.ceil((data.resetAt - now) / 1000),
  };
}

/**
 * Middleware for Vercel: Apply rate limit and return 429 if exceeded
 * Usage: Call this at the start of your handler
 */
export function applyRateLimit(req, res, keyOrFn, maxRequests = 100, windowMs = 900000) {
  const ip = getClientIP(req);
  const key = typeof keyOrFn === 'function' ? keyOrFn(req, ip) : keyOrFn || ip;

  const result = checkRateLimit(key, maxRequests, windowMs);

  // Set rate limit headers (helps clients understand limits)
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter);
    return res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Please retry after ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter,
    });
  }

  return null; // No error — continue processing
}
