const { Kafka } = require('kafkajs');

// PHASE 4 — deployment support.
// Kafka needs a persistently-running broker, which our free-tier hosting
// doesn't provide (see README for the reasoning). Rather than crash or
// hang trying to connect to a broker that doesn't exist in production,
// we treat Kafka as fully optional: only when KAFKA_ENABLED=true (locally,
// where a broker is actually running) does publishing attempt anything.
const KAFKA_ENABLED = process.env.KAFKA_ENABLED === 'true';

const kafka = new Kafka({
  clientId: 'ticket-booking-app',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();
let producerConnected = false;

async function getProducer() {
  if (!producerConnected) {
    await producer.connect();
    producerConnected = true;
    console.log('Kafka producer connected');
  }
  return producer;
}

const BOOKING_CONFIRMED_TOPIC = 'booking.confirmed';

/**
 * PHASE 3 — decoupling side effects from the booking path.
 * Instead of confirmBooking() sending an email, generating a ticket, and
 * writing an audit log itself (all inside the request the user is waiting
 * on), it publishes ONE small event here and returns immediately. Separate
 * consumer processes pick this event up independently and do the slow
 * work without making the user wait for any of it.
 */
async function publishBookingConfirmed(payload) {
  if (!KAFKA_ENABLED) {
    // No broker available in this environment — skip silently. The
    // caller already wraps this in its own try/catch, so a booking
    // still succeeds either way; this just avoids ever attempting a
    // connection that would hang or fail in production.
    return;
  }
  const kafkaProducer = await getProducer();
  await kafkaProducer.send({
    topic: BOOKING_CONFIRMED_TOPIC,
    messages: [{ key: String(payload.bookingId), value: JSON.stringify(payload) }],
  });
}

module.exports = { kafka, publishBookingConfirmed, BOOKING_CONFIRMED_TOPIC };