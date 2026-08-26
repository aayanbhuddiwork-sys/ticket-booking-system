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

## Tech stack
Node.js, Express, PostgreSQL, Redis, Kafka, JWT auth.

## What's next
Phase 4: deployment, architecture diagram, rate limiting, polish.

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
```
