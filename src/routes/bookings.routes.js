const express = require('express');
const { bookSeat, myBookings, cancelBooking } = require('../controllers/bookings.controller');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', bookSeat);
router.get('/me', myBookings);
router.delete('/:id', cancelBooking);

module.exports = router;