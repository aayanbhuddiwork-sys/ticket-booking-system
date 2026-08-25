// Run standalone with: node src/consumers/ticket-gen.consumer.js

require('dotenv').config();
const { kafka, BOOKING_CONFIRMED_TOPIC } = require('../config/kafka');

// Different consumer group from the notification service — this matters:
// Kafka delivers each message to every DIFFERENT group independently, so
// both this consumer and notification.consumer.js each get their own copy
// of every event, and can process it at their own pace.
const consumer = kafka.consumer({ groupId: 'ticket-generation-service' });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: BOOKING_CONFIRMED_TOPIC, fromBeginning: false });

  console.log('[ticket-gen-consumer] listening for booking.confirmed events...');

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());

      // Mocked "generate PDF ticket" — a real system might render a PDF
      // and upload it to storage, then email/notify the user it's ready.
      console.log(
        `[ticket-gen-consumer] Generating e-ticket PDF for booking #${event.bookingId} ` +
          `(seat ${event.seatId})`
      );
    },
  });
}

run().catch((err) => {
  console.error('[ticket-gen-consumer] fatal error:', err);
  process.exit(1);
});