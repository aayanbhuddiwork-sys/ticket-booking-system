// Run standalone with: node src/consumers/audit-log.consumer.js

require('dotenv').config();
const { kafka, BOOKING_CONFIRMED_TOPIC } = require('../config/kafka');
const pool = require('../config/db');

const consumer = kafka.consumer({ groupId: 'audit-log-service' });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: BOOKING_CONFIRMED_TOPIC, fromBeginning: false });

  console.log('[audit-log-consumer] listening for booking.confirmed events...');

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());

      // A real audit trail — this one actually writes to Postgres, unlike
      // the other two mocked consumers, to show a consumer CAN do real
      // work independently of the request that triggered it.
      await pool.query(
        `INSERT INTO audit_log (event_type, booking_id, user_id, details)
         VALUES ($1, $2, $3, $4)`,
        ['booking.confirmed', event.bookingId, event.userId, JSON.stringify(event)]
      );

      console.log(`[audit-log-consumer] Logged booking #${event.bookingId} to audit trail`);
    },
  });
}

run().catch((err) => {
  console.error('[audit-log-consumer] fatal error:', err);
  process.exit(1);
});