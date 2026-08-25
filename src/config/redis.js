const Redis = require('ioredis');

// Single shared Redis connection for the whole app.
// Defaults to localhost:6379, which is exactly where `brew services start redis`
// runs it — no extra config needed for local dev.
const redis = new Redis({
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