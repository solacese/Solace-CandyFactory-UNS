/**
 * Subscribe to all haribot/> messages and print them.
 * Usage: npm run sub (from packages/test-harness)
 *        or: node packages/test-harness/src/subscribe-all.mjs (from root)
 */
import 'dotenv/config';
import { connect, subscribe, disconnect } from '@haribot/broker-client';
import { WILDCARD_ALL, parseEvent } from '@haribot/common';

const session = await connect();

console.log('\n📡 Listening on: ' + WILDCARD_ALL);
console.log('   Press Ctrl+C to stop\n');

subscribe(session, WILDCARD_ALL, (topic, raw) => {
  try {
    const event = parseEvent(raw);
    const time = new Date(event.timestamp).toLocaleTimeString();
    console.log(
      `[${time}] ${topic}\n` +
      `  source: ${event.source} | correlationId: ${event.correlationId.slice(0, 8)}...\n` +
      `  payload: ${JSON.stringify(event.payload, null, 2).split('\n').join('\n  ')}\n`
    );
  } catch (err) {
    console.log(`[raw] ${topic}: ${JSON.stringify(raw)}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  disconnect(session);
  process.exit(0);
});
