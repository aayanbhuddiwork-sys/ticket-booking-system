// Run with: npm run db:init
// Creates tables from schema.sql and seeds one demo event with 10 seats.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema applied.');

  const { rows: existing } = await pool.query('SELECT id FROM events LIMIT 1');
  if (existing.length > 0) {
    console.log('Events already exist, skipping seed.');
    await pool.end();
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO events (name, venue, event_date, total_seats)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['Coldplay Live', 'DY Patil Stadium, Mumbai', '2026-12-20T19:00:00Z', 10]
  );
  const eventId = rows[0].id;

  const seatInserts = [];
  for (let i = 1; i <= 10; i++) {
    seatInserts.push(
      pool.query(
        `INSERT INTO seats (event_id, seat_number, price) VALUES ($1, $2, $3)`,
        [eventId, `A${i}`, 1999.0]
      )
    );
  }
  await Promise.all(seatInserts);

  console.log(`Seeded event id=${eventId} with 10 seats (A1-A10).`);
  await pool.end();
}

init().catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});
