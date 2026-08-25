// Run standalone with: node src/consumers/notification.consumer.js
// A separate OS process from the API server — this is what "decoupled"
// actually means in practice: this file can crash, restart, or be scaled
// to multiple instances without ever affecting the booking API.

require('dotenv').config();
const { kafka, BOOKING_CONFIRMED_TOPIC } = require('../config/kafka');

const consumer = kafka.consumer({ groupId: 'notification-service' });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: BOOKING_CONFIRMED_TOPIC, fromBeginning: false });

  console.log('[notification-consumer] listening for booking.confirmed events...');

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());

      // Mocked "send email" — in a real system this would call an email
      // provider's API (SendGrid, SES, etc). The point here is that this
      // work happens completely independently of the booking request.
      console.log(
        `[notification-consumer] Sending confirmation email for booking #${event.bookingId} ` +
          `(user ${event.userId}, seat ${event.seatId}, ₹${event.amount})`
      );
    },
  });
}

run().catch((err) => {
  console.error('[notification-consumer] fatal error:', err);
  process.exit(1);
});