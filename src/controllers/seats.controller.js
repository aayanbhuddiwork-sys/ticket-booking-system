const pool = require('../config/db');

async function listSeatsForEvent(req, res) {
  try {
    const { eventId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, seat_number, status, price FROM seats
       WHERE event_id = $1 ORDER BY seat_number ASC`,
      [eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error('listSeatsForEvent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { listSeatsForEvent };
