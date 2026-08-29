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
