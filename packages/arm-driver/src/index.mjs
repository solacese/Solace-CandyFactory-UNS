/**
 * Arm Driver Entry Point
 *
 * Subscribes to arm/command and drives the simulated (or real) SO-101.
 * Publishes arm/telemetry and arm/status.
 */
import 'dotenv/config';
import { connect, publish, subscribe, disconnect } from '@haribot/broker-client';
import { TOPICS, createEvent, SOURCES, parseEvent } from '@haribot/common';
import { SimulatedArm } from './simulated.mjs';

const ARM_MODE = process.env.ARM_MODE || 'simulated';

if (ARM_MODE === 'real') {
  console.log('[arm-driver] Real SO-101 mode selected');
  console.log('[arm-driver] WARNING: Real driver not yet implemented. Falling back to simulated.');
}

console.log(`[arm-driver] Starting in ${ARM_MODE} mode`);

const session = await connect();

// Create the arm instance
const arm = new SimulatedArm({
  onTelemetry: (telemetry) => {
    const event = createEvent({
      source: SOURCES.ARM_DRIVER,
      correlationId: 'telemetry',
      payload: telemetry,
    });
    publish(session, TOPICS.ARM_TELEMETRY, event);
  },
  onStatusChange: (status) => {
    const event = createEvent({
      source: SOURCES.ARM_DRIVER,
      correlationId: 'status',
      payload: status,
    });
    publish(session, TOPICS.ARM_STATUS, event);
    console.log(`[arm-driver] Status: ${status.status}`);
  },
});

// Start the arm simulation
arm.start();

// Subscribe to arm commands
subscribe(session, TOPICS.ARM_COMMAND, (topic, raw) => {
  try {
    const event = parseEvent(raw);
    const { commandType, params } = event.payload;
    console.log(`[arm-driver] Command: ${commandType} (correlationId=${event.correlationId.slice(0, 8)})`);
    arm.executeCommand(event.payload);
  } catch (err) {
    console.error('[arm-driver] Error processing command:', err.message);
  }
});

console.log('[arm-driver] Listening for commands on:', TOPICS.ARM_COMMAND);
console.log('[arm-driver] Publishing telemetry on:', TOPICS.ARM_TELEMETRY);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[arm-driver] Shutting down...');
  arm.stop();
  disconnect(session);
  process.exit(0);
});
