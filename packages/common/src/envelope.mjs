import { randomUUID } from 'node:crypto';

/**
 * Event Envelope
 *
 * Every message on the UNS uses this consistent structure:
 * {
 *   eventId:       string (UUID v4, unique per event)
 *   timestamp:     string (ISO 8601)
 *   source:        string (which component published this)
 *   correlationId: string (UUID v4, ties an order to its full lifecycle)
 *   payload:       object (message-type-specific data)
 * }
 */

/** Known event sources */
export const SOURCES = Object.freeze({
  ORDER_AGENT: 'order-agent',
  INVENTORY_AGENT: 'inventory-agent',
  PACKING_AGENT: 'packing-agent',
  ARM_AGENT: 'arm-agent',
  ARM_DRIVER: 'arm-driver',
  UI: 'ui',
});

/**
 * Create a new event envelope.
 *
 * @param {object} opts
 * @param {string} opts.source - One of SOURCES
 * @param {string} opts.correlationId - Existing correlation ID (for continuing a chain)
 * @param {object} opts.payload - Message-type-specific data
 * @returns {object} Complete event envelope
 */
export function createEvent({ source, correlationId, payload }) {
  if (!source) throw new Error('Event envelope requires a source');
  if (!payload || typeof payload !== 'object') throw new Error('Event envelope requires a payload object');

  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    correlationId: correlationId || randomUUID(),
    payload,
  };
}

/**
 * Parse and validate an incoming event envelope.
 * Returns the parsed object or throws with a descriptive error.
 *
 * @param {string|object} raw - JSON string or already-parsed object
 * @returns {object} Validated event envelope
 */
export function parseEvent(raw) {
  const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const required = ['eventId', 'timestamp', 'source', 'correlationId', 'payload'];
  for (const field of required) {
    if (!(field in event)) {
      throw new Error(`Event envelope missing required field: ${field}`);
    }
  }

  if (typeof event.payload !== 'object' || event.payload === null) {
    throw new Error('Event payload must be a non-null object');
  }

  return event;
}
