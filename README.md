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

## Tested end to end
- Two different users competing for the same seat → second one correctly
  blocked, in both Phase 1 and Phase 2
- Redis holds correctly auto-expire if payment never happens
- Bookings persist correctly in PostgreSQL even after restarting the server

## Tech stack
Node.js, Express, PostgreSQL, Redis, JWT auth.

## What's next
Phase 3 will add Kafka to decouple notifications/e-ticket generation from
the booking flow itself.

## Running it locally
```bash
npm install
createdb ticket_booking
brew install redis && brew services start redis
cp .env.example .env   # fill in DB + JWT + Redis config
npm run db:init
npm run dev
```
