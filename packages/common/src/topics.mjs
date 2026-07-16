/**
 * UNS Topic Taxonomy for Haribot
 *
 * ISA-95-style hierarchy:
 *   haribot/{site}/{area}/{line}/{cell}/{message-type}
 *
 * Default site: paris-demo
 */

export const SITE = 'paris-demo';
export const AREA = 'packing';
export const LINE = 'line1';

/** Build a fully-qualified UNS topic */
export function topic(messageType, { site = SITE, area = AREA, line = LINE } = {}) {
  return `haribot/${site}/${area}/${line}/${messageType}`;
}

/** All known message types */
export const MESSAGE_TYPES = Object.freeze({
  // Orders
  ORDER_CREATED: 'orders/created',
  ORDER_VALIDATED: 'orders/validated',
  ORDER_REJECTED: 'orders/rejected',

  // Inventory
  INVENTORY_RESERVED: 'inventory/reserved',
  INVENTORY_INSUFFICIENT: 'inventory/insufficient',

  // Pack job
  PACK_JOB_SEQUENCED: 'pack-job/sequenced',
  PACK_JOB_STATUS: 'pack-job/status',

  // Arm
  ARM_COMMAND: 'arm/command',
  ARM_TELEMETRY: 'arm/telemetry',
  ARM_STATUS: 'arm/status',

  // Human-in-the-loop
  HITL_APPROVAL_REQUIRED: 'hitl/approval-required',
  HITL_APPROVED: 'hitl/approved',
});

/** Pre-built full topic strings for the default demo line */
export const TOPICS = Object.freeze(
  Object.fromEntries(
    Object.entries(MESSAGE_TYPES).map(([key, msgType]) => [key, topic(msgType)])
  )
);

/** Wildcard subscription for the entire haribot namespace */
export const WILDCARD_ALL = 'haribot/>';

/** Wildcard for a specific demo line */
export const WILDCARD_LINE = topic('>');
