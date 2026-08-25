const express = require('express');
const { createEvent, listEvents, getEvent } = require('../controllers/events.controller');
const { listSeatsForEvent } = require('../controllers/seats.controller');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.get('/', listEvents);
router.get('/:id', getEvent);
router.get('/:eventId/seats', listSeatsForEvent);
router.post('/', authenticate, createEvent); // in a real app you'd also check for an admin role

module.exports = router;
