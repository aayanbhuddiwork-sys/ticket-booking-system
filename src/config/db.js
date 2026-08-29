const { Pool } = require('pg');

// PHASE 4 — deployment support.
// Neon (our hosted Postgres) gives one combined connection string instead
// of separate host/user/password values. If DATABASE_URL is set (as it
// will be on Render), use that. Otherwise fall back to the separate
// PG* variables, exactly as before — so local development is unaffected.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon requires SSL
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = pool;
