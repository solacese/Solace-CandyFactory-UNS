/**
 * Payload schemas / factories for each message type.
 * These define the shape of `event.payload` for each topic.
 */

/** Available sweet types in the demo */
export const SWEET_TYPES = Object.freeze([
  'goldbears',
  'happy-cola',
  'starmix',
  'tangfastics',
]);

/** Max items per order (prevents absurd quantities in demo) */
export const MAX_ORDER_QUANTITY = 10;
export const MAX_ITEMS_PER_ORDER = 5;

// --- Order Payloads ---

/**
 * orders/created payload
 * @param {object} opts
 * @param {string} opts.customerName
 * @param {Array<{sweetType: string, quantity: number}>} opts.items
 */
export function orderCreatedPayload({ customerName, email, items }) {
  return {
    customerName,
    email,
    items, // [{sweetType: 'goldbears', quantity: 2}, ...]
    status: 'pending',
  };
}

/**
 * orders/validated payload
 */
export function orderValidatedPayload({ customerName, items }) {
  return {
    customerName,
    items,
    status: 'validated',
  };
}

/**
 * orders/rejected payload
 */
export function orderRejectedPayload({ customerName, items, reason }) {
  return {
    customerName,
    items,
    status: 'rejected',
    reason,
  };
}

// --- Inventory Payloads ---

export function inventoryReservedPayload({ items, remainingStock }) {
  return {
    items,
    remainingStock, // {sweetType: quantity, ...}
    status: 'reserved',
  };
}

export function inventoryInsufficientPayload({ items, availableStock, reason }) {
  return {
    items,
    availableStock,
    status: 'insufficient',
    reason,
  };
}

// --- Pack Job Payloads ---

/**
 * pack-job/sequenced payload
 * @param {object} opts
 * @param {Array<{sweetType: string, quantity: number, binPosition: number}>} opts.sequence
 */
export function packJobSequencedPayload({ sequence }) {
  return {
    sequence, // ordered list of picks
    status: 'sequenced',
  };
}

/**
 * pack-job/status payload
 * @param {string} status - sequenced | in-progress | pick-N | complete | failed
 * @param {string} [detail] - human-readable detail
 */
export function packJobStatusPayload({ status, detail }) {
  return { status, detail };
}

// --- Arm Payloads ---

/**
 * arm/command payload
 * @param {string} commandType - move-to | pick | place | home | stop
 * @param {object} [params] - command-specific parameters
 */
export function armCommandPayload({ commandType, params }) {
  return { commandType, params };
}

/**
 * arm/telemetry payload
 * Published by arm driver at regular intervals
 */
export function armTelemetryPayload({ jointAngles, gripperState }) {
  return {
    jointAngles, // [j1, j2, j3, j4, j5, j6] in degrees
    gripperState, // 'open' | 'closed' | number (0-100)
  };
}

/**
 * arm/status payload
 */
export function armStatusPayload({ status, detail }) {
  return {
    status, // idle | planning | awaiting-approval | executing | fault
    detail,
  };
}

// --- HITL Payloads ---

/**
 * hitl/approval-required payload
 */
export function hitlApprovalRequiredPayload({ plannedMotion, reason }) {
  return {
    plannedMotion, // description or structured motion plan
    reason, // why approval is needed
    status: 'awaiting-approval',
  };
}

/**
 * hitl/approved payload
 */
export function hitlApprovedPayload({ approvedBy }) {
  return {
    approvedBy, // operator identifier
    status: 'approved',
  };
}
