const express = require('express');
const {
  bookSeat,
  myBookings,
  cancelBooking,
  holdSeat,
  confirmBooking,
  releaseHold,
} = require('../controllers/bookings.controller');
const authenticate = require('../middleware/auth');
const { holdLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.use(authenticate); // all booking routes require a logged-in user

// Phase 1 — direct DB-lock booking (kept for comparison/demo purposes)
router.post('/', bookSeat);

// Phase 2 — Redis-based hold -> (mock payment) -> confirm flow
router.post('/hold', holdLimiter, holdSeat); // extra protection: this is the endpoint someone would script/spam during a flash sale
router.post('/confirm', confirmBooking);
router.post('/release', releaseHold);

router.get('/me', myBookings);
router.delete('/:id', cancelBooking);

module.exports = router;