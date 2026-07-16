/**
 * Extended UNS topic taxonomy — full ISA-95 stack.
 * Base: haribot/paris-demo/packing/line1/{message-type}
 */

const SITE = 'paris-demo';
const AREA = 'packing';
const LINE = 'line1';
const PREFIX = `haribot/${SITE}/${AREA}/${LINE}`;

export function topic(msgType) {
  return `${PREFIX}/${msgType}`;
}

// ─── LEVEL 5: MARKETPLACE / COMMERCE ─────────────────────────
export const MARKETPLACE = {
  ORDER_CREATED: topic('orders/created'),
  ORDER_VALIDATED: topic('orders/validated'),
  ORDER_REJECTED: topic('orders/rejected'),
};

// ─── LEVEL 4: ERP / BUSINESS PLANNING ────────────────────────
export const ERP = {
  WORK_ORDER_CREATED: topic('erp/work-order/created'),
  WORK_ORDER_SCHEDULED: topic('erp/work-order/scheduled'),
  WORK_ORDER_RELEASED: topic('erp/work-order/released'),
  WORK_ORDER_COMPLETED: topic('erp/work-order/completed'),
  MATERIAL_ALLOCATED: topic('erp/material/allocated'),
};

// ─── LEVEL 3: MES / MANUFACTURING OPS ────────────────────────
export const MES = {
  PRODUCTION_STARTED: topic('mes/production/started'),
  PRODUCTION_STEP_BEGUN: topic('mes/production/step-begun'),
  PRODUCTION_STEP_COMPLETE: topic('mes/production/step-complete'),
  PRODUCTION_COMPLETE: topic('mes/production/complete'),
  OEE_UPDATE: topic('mes/oee/update'),
  QUALITY_CHECK: topic('mes/quality/check'),
  BATCH_STATUS: topic('mes/batch/status'),
};

// ─── LEVEL 2: SCADA / SUPERVISORY CONTROL ────────────────────
export const SCADA = {
  SENSOR_READING: topic('scada/sensor/reading'),
  CONVEYOR_STATUS: topic('scada/conveyor/status'),
  ALARM_RAISED: topic('scada/alarm/raised'),
  ALARM_ACKNOWLEDGED: topic('scada/alarm/acknowledged'),
  PROCESS_VALUE: topic('scada/process/value'),
  LINE_STATUS: topic('scada/line/status'),
};

// ─── LEVEL 0-1: ARM / FIELD CONTROL ─────────────────────────
export const ARM = {
  COMMAND: topic('arm/command'),
  TELEMETRY: topic('arm/telemetry'),
  STATUS: topic('arm/status'),
  HITL_REQUIRED: topic('hitl/approval-required'),
  HITL_APPROVED: topic('hitl/approved'),
};

// Wildcard patterns per layer
export const WILDCARDS = {
  ALL: 'haribot/>',
  ORDERS: `${PREFIX}/orders/`,
  ERP: `${PREFIX}/erp/`,
  MES: `${PREFIX}/mes/`,
  SCADA: `${PREFIX}/scada/`,
  ARM: `${PREFIX}/arm/`,
  HITL: `${PREFIX}/hitl/`,
};

// All topics flat (for reference)
export const ALL_TOPICS = { ...MARKETPLACE, ...ERP, ...MES, ...SCADA, ...ARM };
