/**
 * PHASE 4 — a custom error class for expected, "operational" errors:
 * things like "seat not found" or "invalid credentials" that we deliberately
 * throw with a specific message and HTTP status code.
 *
 * This is different from a genuine bug (a typo, a null reference) — those
 * are "programming errors" and should NOT be shown to the user with a
 * friendly message; they should be logged and reported as a generic
 * 500, since the details are only useful to us, not the client.
 *
 * Usage in a controller: throw new AppError('Seat not found', 404);
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // marks this as an expected, "safe to show" error
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;