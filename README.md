# Real-Time Event Ticket Booking System — Phase 1

Core booking system: auth, events, seats, bookings. Runs on PostgreSQL only —
no Redis or Kafka yet (those come in Phase 2 and Phase 3).

## Anti-oversell strategy in this phase

There's no Redis lock yet, so concurrency safety comes from PostgreSQL's
row-level locking: `SELECT ... FOR UPDATE` inside a transaction (see
`bookSeat` in `src/controllers/bookings.controller.js`). Two simultaneous
requests for the same seat serialize on that row lock — one wins, the other
gets a clean 409 "seat unavailable". This is functionally correct but holds
a DB connection open for the whole booking + mock-payment step, which is
exactly the bottleneck Phase 2's Redis lock (SETNX/Lua + TTL) is designed
to remove. Worth remembering as a talking point later.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a PostgreSQL database:
   ```bash
   createdb ticket_booking
   ```

3. Copy `.env.example` to `.env` and fill in your DB credentials + a JWT secret:
   ```bash
   cp .env.example .env
   ```

4. Initialize the schema and seed a demo event (10 seats):
   ```bash
   npm run db:init
   ```

5. Start the server:
   ```bash
   npm run dev   # with nodemon, or: npm start
   ```

Server runs at `http://localhost:4000`.

## API Reference

### Auth
- `POST /api/auth/register` — `{ name, email, password }` → `{ user, token }`
- `POST /api/auth/login` — `{ email, password }` → `{ user, token }`

### Events (public read, auth required to create)
- `GET /api/events` — list events with available seat counts
- `GET /api/events/:id` — get one event
- `GET /api/events/:eventId/seats` — list seats + status for an event
- `POST /api/events` — `{ name, venue, event_date, total_seats, price }` (requires `Authorization: Bearer <token>`)

### Bookings (all require `Authorization: Bearer <token>`)
- `POST /api/bookings` — `{ eventId, seatId }` → books the seat, mock-pays, returns booking
- `GET /api/bookings/me` — list your bookings
- `DELETE /api/bookings/:id` — cancel a booking, releases the seat

## Testing the race condition (Phase 1 baseline)

Register a user, grab a token, note a `seatId` from `GET /api/events/1/seats`,
then fire two booking requests for the *same* seat at (almost) the same time:

```bash
curl -X POST http://localhost:4000/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"eventId":1,"seatId":1}' &
curl -X POST http://localhost:4000/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"eventId":1,"seatId":1}' &
wait
```

One request returns `201` with a confirmed booking, the other returns `409
seat unavailable`. No double booking. In Phase 2 this same test will show
the difference in response latency once the lock moves to Redis.

## Next phases
- **Phase 2**: Redis atomic locking (`SETNX`/Lua) with TTL, acquired before
  the DB write, replacing the `FOR UPDATE` row lock as the primary guard.
- **Phase 3**: Kafka `booking.confirmed` event → consumers for email/SMS,
  e-ticket generation, audit logging.
- **Phase 4**: Deployment, architecture diagram, rate limiting, polish.
