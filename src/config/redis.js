const Redis = require('ioredis');

// PHASE 4 — deployment support.
// Upstash (our hosted Redis) gives one connection URL (rediss://...)
// instead of separate host/port. If REDIS_URL is set (as it will be on
// Render), use that. Otherwise fall back to host/port, exactly as
// before — so local development is unaffected.
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
    });

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

module.exports = redis;