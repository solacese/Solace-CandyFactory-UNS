/**
 * Publish a fake order to orders/created.
 * Usage: npm run pub (from packages/test-harness)
 *        or: node packages/test-harness/src/publish-order.mjs (from root)
 */
import 'dotenv/config';
import { connect, publish, disconnect } from '@haribot/broker-client';
import { TOPICS, createEvent, SOURCES, orderCreatedPayload } from '@haribot/common';

const session = await connect();

const event = createEvent({
  source: SOURCES.UI,
  payload: orderCreatedPayload({
    customerName: 'Demo Customer',
    items: [
      { sweetType: 'goldbears', quantity: 3 },
      { sweetType: 'happy-cola', quantity: 2 },
    ],
  }),
});

console.log(`\n📦 Publishing order to: ${TOPICS.ORDER_CREATED}`);
console.log(`   correlationId: ${event.correlationId}`);
console.log(`   payload:`, JSON.stringify(event.payload, null, 2));

publish(session, TOPICS.ORDER_CREATED, event);

console.log('\n✅ Published successfully');

// Give time for delivery before disconnecting
setTimeout(() => {
  disconnect(session);
  process.exit(0);
}, 1000);
