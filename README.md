# Real-Time Event Ticket Booking System

A backend that prevents overselling limited event tickets — the same
problem platforms like Flipkart or Amazon face when many people try to buy
the same limited-stock item at once. If two users try to book the same seat
at the exact same moment, only one should ever win.

## Phase 1 — PostgreSQL row-level locking

Built the core system first: auth, events, seats, bookings, backed entirely
by PostgreSQL. To stop two people from booking the same seat, every booking
runs inside a database transaction using `SELECT ... FOR UPDATE` — this
locks that specific seat's row until the transaction finishes. If two
requests hit the same seat at once, the second one is forced to wait, then
sees the seat's already booked and gets rejected cleanly.

This is correct and I tested it — including with two genuinely separate
user accounts trying to grab the same seat. But it has a real limitation:
the database connection stays open for the whole booking + payment flow,
which doesn't scale well if thousands of people are competing for the same
seats at once (a real flash-sale scenario).

## Phase 2 — Redis locks with auto-expiry

That limitation is exactly why Phase 2 exists. Instead of locking a
database row for the whole flow, the app now grabs a lock in Redis
*before* payment even starts — `SET key value NX EX 180`. `NX` means Redis
only lets one request ever successfully create that lock; `EX 180` means
the lock auto-expires after 3 minutes if someone abandons checkout, so
there's no manual cleanup needed. Only once payment is confirmed does the
app write anything permanent to the database and release the lock.

Same guarantee as Phase 1 — no seat is ever double-booked — but the lock
is grabbed and released fast, and the database is never touched until
there's an actual confirmed sale.

## Phase 3 — Kafka event pipeline

Once a booking is confirmed, there's real work that has nothing to do with
whether the seat is available — sending a confirmation email, generating
a PDF ticket, writing an audit log. None of that needs to block the
user's response.

So instead of doing that work inside `confirmBooking` itself, the app now
publishes one small event to Kafka — `booking.confirmed` — right after
the database commit succeeds, then responds to the user immediately. It
doesn't wait for anything else to happen.

Three separate, independent processes listen for that event and react to
it on their own: a notification consumer (mocked email), a ticket
generation consumer (mocked PDF), and an audit-log consumer that actually
writes a real row to Postgres. Each one runs as its own process — any of
them could crash or restart without affecting the booking API at all.

## Phase 4 — Rate limiting, error handling, and deployment

With the core system working, this phase made it genuinely production-
minded rather than just "correct."

**Rate limiting**, backed by Redis rather than in-memory storage — so the
limit is shared across every instance of the app, not just whichever
server happened to handle a given request. A loose baseline (100
requests/minute) applies everywhere; a stricter limit protects
`/auth/login` and `/auth/register` against brute-force attempts, and
another protects `/bookings/hold` specifically, since that's the exact
endpoint someone would script or spam during a real flash sale.

**Centralized error handling** — a custom `AppError` class for
deliberate, expected errors ("seat not found") versus genuine unexpected
bugs, wired through an `asyncHandler` wrapper so controllers don't need
manual try/catch blocks. One central handler decides every error
response: operational errors return their real message and status code,
but anything unexpected is logged in full on the server while the client
only ever sees a generic message — never a leaked stack trace or raw SQL
error in production.

**Deployment** — the API is genuinely live, not just running locally (see
below).

## Tested end to end
- Two different users competing for the same seat → second one correctly
  blocked, in both Phase 1 and Phase 2
- Redis holds correctly auto-expire if payment never happens
- Bookings persist correctly in PostgreSQL even after restarting the server
- Ran the API and all three Kafka consumers as four separate processes at
  once; confirmed a real booking and watched all three consumers react to
  the same event independently, in parallel
- Verified the audit-log consumer's write actually landed in Postgres by
  querying the `audit_log` table directly
- Fired 12 rapid login attempts and confirmed the rate limiter correctly
  started rejecting requests partway through with `429`
- Requested a nonexistent event and confirmed the centralized error
  handler returned a clean `404` via the `AppError` path
- **Full live deployment**, tested end to end against the real public
  URL: registration, seat listing, and a complete hold → confirm booking
  flow, all using hosted Postgres and Redis over the real internet

## Live demo

The API is deployed and publicly reachable: **https://ticket-booking-system-0vdx.onrender.com**

This is a real backend API, not a website — there's no visual interface,
so interacting with it means sending HTTP requests directly (curl,
Postman, etc.), same as the examples below.

```bash
# health check
curl https://ticket-booking-system-0vdx.onrender.com/health

# register a user
curl -X POST https://ticket-booking-system-0vdx.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"test1234"}'

# see seats for the demo event
curl https://ticket-booking-system-0vdx.onrender.com/api/events/1/seats
```

Deployed on Render's free tier — the instance sleeps after periods of
inactivity, so the first request after a while can take 20-30 seconds to
wake it back up. Subsequent requests are fast.

### What's live vs. local-only

**Live in production:** the core API, PostgreSQL row-level locking (Phase
1), and the Redis hold/confirm flow with rate limiting (Phase 2 and 4) —
hosted on Neon (Postgres) and Upstash (Redis), both free tier.

**Local-only, by design:** the Kafka pipeline (Phase 3). Kafka needs a
persistently-running broker, which isn't something free-tier hosting
supports well — running it there would mean paying for infrastructure
just to keep a demo project's broker alive. Rather than do that, Kafka
and its three consumers only run when the project is running locally
(see the setup instructions below). In a real production deployment,
this is exactly the kind of thing you'd point at a managed service like
Confluent Cloud or AWS MSK instead of self-hosting a broker — deliberately
keeping this project's own hosting free and simple was the right call
here, not a limitation I didn't notice.

## Tech stack
Node.js, Express, PostgreSQL, Redis, Kafka, JWT auth. Deployed on Render,
Neon, and Upstash.

## What's next
This is currently an API-only project — no visual interface, only
curl/Postman. A frontend is the natural next step.

## Running it locally
```bash
npm install
createdb ticket_booking
brew install redis && brew services start redis
brew install kafka && brew services start kafka
cp .env.example .env   # fill in DB + JWT + Redis + Kafka config
npm run db:init
npm run dev

# in separate terminals:
npm run consumer:notify
npm run consumer:ticket
npm run consumer:audit
```