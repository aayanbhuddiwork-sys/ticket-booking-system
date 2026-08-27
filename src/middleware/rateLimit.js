const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

/**
 * PHASE 4 — rate limiting.
 *
 * Backed by Redis (not in-memory) so the count is shared across every
 * instance of this app, not just the one process that happened to handle
 * a given request. If this app ever ran behind a load balancer with
 * multiple servers, an in-memory limiter on Server A would have no idea
 * how many requests Server B just handled from the same IP — someone
 * could dodge the limit just by getting routed around. Redis makes the
 * limit a single shared source of truth.
 */
function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // adds RateLimit-* headers so clients can see their remaining quota
    legacyHeaders: false,
    message: { error: message },
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
    }),
  });
}

// Loose baseline for every route — just to stop obvious abuse.
const generalLimiter = makeLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many requests, please slow down.',
});

// Stricter limit for auth routes — protects against brute-force login/
// registration attempts.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many auth attempts, please try again later.',
});

// Stricter limit specifically for seat holds — a real flash-sale endpoint
// is exactly what someone might try to script/spam to grief other users.
const holdLimiter = makeLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many hold attempts, please slow down.',
});

module.exports = { generalLimiter, authLimiter, holdLimiter };