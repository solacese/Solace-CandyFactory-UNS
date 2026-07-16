/**
 * Combined test: subscribe, then publish an order, verify it arrives.
 * Usage: npm run test:harness (from workspace root)
 */
import 'dotenv/config';
import { connect, publish, subscribe, disconnect } from '@haribot/broker-client';
import { TOPICS, WILDCARD_ALL, createEvent, parseEvent, SOURCES, orderCreatedPayload } from '@haribot/common';

console.log('🧪 Haribot UNS Test Harness');
console.log('===========================\n');

let received = false;

// Connect
const session = await connect();

// Subscribe to everything
subscribe(session, WILDCARD_ALL, (topic, raw) => {
  try {
    const event = parseEvent(raw);
    console.log(`\n✅ RECEIVED on: ${topic}`);
    console.log(`   eventId:       ${event.eventId}`);
    console.log(`   timestamp:     ${event.timestamp}`);
    console.log(`   source:        ${event.source}`);
    console.log(`   correlationId: ${event.correlationId}`);
    console.log(`   payload:       ${JSON.stringify(event.payload)}`);
    received = true;
  } catch (err) {
    console.error(`❌ Parse error: ${err.message}`);
  }
});

// Wait briefly for subscription to be established
await new Promise((r) => setTimeout(r, 500));

// Publish a test order
const event = createEvent({
  source: SOURCES.UI,
  payload: orderCreatedPayload({
    customerName: 'Test User',
    items: [
      { sweetType: 'goldbears', quantity: 2 },
      { sweetType: 'starmix', quantity: 1 },
    ],
  }),
});

console.log(`\n📤 Publishing to: ${TOPICS.ORDER_CREATED}`);
publish(session, TOPICS.ORDER_CREATED, event);

// Wait for the message to arrive
await new Promise((r) => setTimeout(r, 2000));

if (received) {
  console.log('\n\n🎉 SUCCESS: Event round-trip verified');
  console.log('   Topic taxonomy and envelope structure are working correctly.');
} else {
  console.error('\n\n❌ FAILURE: No message received within 2 seconds');
  console.error('   Check broker connectivity and subscription permissions.');
}

disconnect(session);
process.exit(received ? 0 : 1);
