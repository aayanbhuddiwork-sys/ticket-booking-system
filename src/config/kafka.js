const { Kafka } = require('kafkajs');

// One shared Kafka client for the whole app. 'localhost:9092' is exactly
// where the Homebrew-installed broker listens by default.
const kafka = new Kafka({
  clientId: 'ticket-booking-app',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();
let producerConnected = false;

/**
 * Lazily connects the producer on first use, then reuses the same
 * connection for every subsequent publish. Kafka connections are
 * relatively expensive to open, so we don't want to reconnect per request.
 */
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
  const kafkaProducer = await getProducer();
  await kafkaProducer.send({
    topic: BOOKING_CONFIRMED_TOPIC,
    messages: [{ key: String(payload.bookingId), value: JSON.stringify(payload) }],
  });
}

module.exports = { kafka, publishBookingConfirmed, BOOKING_CONFIRMED_TOPIC };