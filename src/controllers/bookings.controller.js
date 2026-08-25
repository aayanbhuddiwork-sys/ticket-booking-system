const pool = require('../config/db');
const redis = require('../config/redis');

const HOLD_SECONDS = 180; // 3 minute reservation window, same idea as a movie-ticket countdown

function lockKey(eventId, seatId) {
  return `seat_lock:${eventId}:${seatId}`;
}

async function holdSeat(req, res) {
  const { eventId, seatId } = req.body;
  const userId = req.user.id;

  if (!eventId || !seatId) {
    return res.status(400).json({ error: 'eventId and seatId are required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT status FROM seats WHERE id = $1 AND event_id = $2`,
      [seatId, eventId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Seat not found for this event' });
    }
    if (rows[0].status === 'booked') {
      return res.status(409).json({ error: 'Seat already booked' });
    }

    const key = lockKey(eventId, seatId);
    const acquired = await redis.set(key, userId, 'EX', HOLD_SECONDS, 'NX');

    if (!acquired) {
      return res.status(409).json({ error: 'Seat unavailable — someone else is holding it' });
    }

    res.status(200).json({
      message: 'Seat held — complete payment before the hold expires',
      holdSeconds: HOLD_SECONDS,
    });
  } catch (err) {
    console.error('holdSeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function confirmBooking(req, res) {
  const { eventId, seatId } = req.body;
  const userId = req.user.id;

  if (!eventId || !seatId) {
    return res.status(400).json({ error: 'eventId and seatId are required' });
  }

  const key = lockKey(eventId, seatId);

  try {
    const holder = await redis.get(key);
    if (holder === null) {
      return res.status(409).json({ error: 'Hold expired or was never created — try again' });
    }
    if (holder !== String(userId)) {
      return res.status(403).json({ error: 'This seat is held by another user' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: seatRows } = await client.query(
        `SELECT price FROM seats WHERE id = $1 AND event_id = $2`,
        [seatId, eventId]
      );
      if (seatRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Seat not found for this event' });
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
        [booking.id, seatRows[0].price]
      );

      await client.query('COMMIT');

      await redis.del(key);

      res.status(201).json({ booking, message: 'Payment confirmed, seat booked' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('confirmBooking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function releaseHold(req, res) {
  const { eventId, seatId } = req.body;
  const userId = req.user.id;
  const key = lockKey(eventId, seatId);

  try {
    const holder = await redis.get(key);
    if (holder === String(userId)) {
      await redis.del(key);
    }
    res.json({ message: 'Hold released' });
  } catch (err) {
    console.error('releaseHold error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

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

module.exports = { bookSeat, myBookings, cancelBooking, holdSeat, confirmBooking, releaseHold };