
const pool = require('../config/db');

async function bookSeat(req, res) {
  const { eventId, seatId } = req.body;
  const userId = req.user.id;

  if (!eventId || !seatId) {
    return res.status(400).json({ error: 'eventId and seatId are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: seatRows } = await client.query(
      `SELECT id, status, price FROM seats
       WHERE id = $1 AND event_id = $2
       FOR UPDATE`,
      [seatId, eventId]
    );

    if (seatRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Seat not found for this event' });
    }

    const seat = seatRows[0];
    if (seat.status !== 'available') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Seat unavailable — already locked or booked' });
    }

    await client.query(`UPDATE seats SET status = 'booked' WHERE id = $1`, [seatId]);

    const { rows: bookingRows } = await client.query(
      `INSERT INTO bookings (user_id, event_id, seat_id, status)
       VALUES ($1, $2, $3, 'confirmed') RETURNING *`,
      [userId, eventId, seatId]
    );
    const booking = bookingRows[0];

    await client.query(
      `INSERT INTO payments (booking_id, amount, status) VALUES ($1, $2, 'success')`,
      [booking.id, seat.price]
    );

    await client.query('COMMIT');
    res.status(201).json({ booking, message: 'Seat booked successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('bookSeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

async function myBookings(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT b.id, b.status, b.created_at, e.name AS event_name, s.seat_number
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN seats s ON s.id = b.seat_id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('myBookings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function cancelBooking(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = rows[0];
    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Booking already cancelled' });
    }

    await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [id]);
    await client.query(`UPDATE seats SET status = 'available' WHERE id = $1`, [booking.seat_id]);

    await client.query('COMMIT');
    res.json({ message: 'Booking cancelled, seat released' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cancelBooking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { bookSeat, myBookings, cancelBooking };