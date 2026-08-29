const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { asyncHandler } = require('../middleware/errorHandler');

async function createEvent(req, res) {
  try {
    const { name, venue, event_date, total_seats } = req.body;
    if (!name || !venue || !event_date || !total_seats) {
      return res.status(400).json({ error: 'name, venue, event_date and total_seats are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO events (name, venue, event_date, total_seats)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, venue, event_date, total_seats]
      );
      const event = rows[0];

      // Auto-generate seats A1..A{n}
      const seatQueries = [];
      for (let i = 1; i <= total_seats; i++) {
        seatQueries.push(
          client.query(
            `INSERT INTO seats (event_id, seat_number, price) VALUES ($1, $2, $3)`,
            [event.id, `A${i}`, req.body.price || 0]
          )
        );
      }
      await Promise.all(seatQueries);

      await client.query('COMMIT');
      res.status(201).json(event);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('createEvent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function listEvents(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, 
        COUNT(s.id) FILTER (WHERE s.status = 'available') AS available_seats
       FROM events e
       LEFT JOIN seats s ON s.event_id = e.id
       GROUP BY e.id
       ORDER BY e.event_date ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('listEvents error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PHASE 4 example: rewritten with asyncHandler + AppError instead of a
// manual try/catch. No try/catch needed here at all — asyncHandler
// (wrapping this function in the router) automatically forwards any
// thrown error, including this AppError, to the central error handler.
const getEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new AppError('Event not found', 404);
  }
  res.json(rows[0]);
});

module.exports = { createEvent, listEvents, getEvent };