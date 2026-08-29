require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

/**
 * PHASE 4 — process-level safety nets.
 *
 * These catch two categories of truly unexpected crash that never even
 * reach our Express error handler: a rejected promise nobody caught
 * (unhandledRejection) and a synchronous error thrown outside any
 * request at all (uncaughtException, e.g. in a timer or startup code).
 * Without these, Node would either crash silently or leave the process
 * in an unknown, possibly-broken state. We log the error clearly, then
 * shut down gracefully — letting something like nodemon/a process
 * manager restart us cleanly, rather than limping along in a bad state.
 */
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...', err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});
