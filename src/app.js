const express = require('express');
const cors = require('cors');
const { generalLimiter } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const eventRoutes = require('./routes/events.routes');
const bookingRoutes = require('./routes/bookings.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(generalLimiter); // baseline rate limit on every route

// Friendly root route — this is an API with no visual interface, so a
// bare visit to the base URL would otherwise 404. This just gives anyone
// browsing to the root URL directly a clear pointer to where to look
// instead, rather than a raw "Route not found" error.
app.get('/', (req, res) => {
  res.json({
    message: 'Ticket Booking System API is running',
    health: '/health',
    docs: 'https://github.com/aayanbhuddiwork-sys/ticket-booking-system',
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Central error handler — see src/middleware/errorHandler.js
app.use(errorHandler);

module.exports = app;