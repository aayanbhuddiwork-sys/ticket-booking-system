/**
 * PHASE 4 — asyncHandler.
 *
 * Express doesn't automatically catch errors thrown inside an async
 * function — if you forget a try/catch, a rejected promise just hangs
 * the request or crashes the process. Wrapping every controller in this
 * function means any thrown error (or rejected promise) is automatically
 * passed to next(err), which routes it straight to our central error
 * handler below — no try/catch boilerplate needed in every controller.
 *
 * Usage: router.get('/me', asyncHandler(myBookings));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * PHASE 4 — centralized error handler.
 *
 * One single place that decides how every error response looks. This
 * distinguishes "operational" errors we threw on purpose (AppError, with
 * a clean message and status code) from unexpected programming errors —
 * those get logged in full detail on the server, but the client only
 * ever sees a generic "Internal server error" message. Leaking a real
 * stack trace or SQL error to the client is a security risk in
 * production, not just messy.
 */
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  if (err.isOperational) {
    // A deliberate AppError — safe to show the message as-is.
    return res.status(err.statusCode).json({
      error: err.message,
      ...(isDev && { stack: err.stack }), // only include the stack trace in dev
    });
  }

  // Anything else is unexpected — log it in full for us, but never leak
  // internals to the client.
  console.error('Unexpected error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { message: err.message, stack: err.stack }),
  });
}

module.exports = { asyncHandler, errorHandler };