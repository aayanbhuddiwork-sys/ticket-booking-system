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

const router = express.Router();

router.use(authenticate);

router.post('/', bookSeat);

router.post('/hold', holdSeat);
router.post('/confirm', confirmBooking);
router.post('/release', releaseHold);

router.get('/me', myBookings);
router.delete('/:id', cancelBooking);

module.exports = router;