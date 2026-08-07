/**
 * ISA-95 Unified Namespace topic taxonomy.
 *
 * The UNS is organized by LOCATION (Enterprise → Site → Area → Line),
 * and each business system publishes at the level where it actually
 * operates — higher-level systems sit ABOVE the physical line:
 *
 *   candyfactory/
 *   ├─ enterprise/
 *   │  ├─ orders/   (L5 — Commerce / marketplace, company-wide)
 *   │  └─ erp/      (L4 — ERP / business planning, company-wide)
 *   └─ paris/                     (Site)
 *      ├─ mes/      (L3 — MES / manufacturing operations, site-wide)
 *      └─ packing/line1/          (Area / Line)
 *         ├─ scada/  (L2 — supervisory control)
 *         ├─ arm/    (L0-1 — field control)
 *         └─ hitl/   (human-in-the-loop approvals)
 */

const ROOT = 'candyfactory';
const ENTERPRISE = `${ROOT}/enterprise`;   // company-wide business systems
const SITE = `${ROOT}/paris`;              // manufacturing site
const LINE = `${SITE}/packing/line1`;      // area / production line

// Helper: build a topic under any of the location prefixes above.
function t(prefix, path) {
  return `${prefix}/${path}`;
}

// ─── LEVEL 5: MARKETPLACE / COMMERCE (enterprise) ────────────
export const MARKETPLACE = {
  ORDER_CREATED: t(ENTERPRISE, 'orders/created'),
  ORDER_VALIDATED: t(ENTERPRISE, 'orders/validated'),
  ORDER_REJECTED: t(ENTERPRISE, 'orders/rejected'),
};

// ─── LEVEL 4: ERP / BUSINESS PLANNING (enterprise) ───────────
export const ERP = {
  WORK_ORDER_CREATED: t(ENTERPRISE, 'erp/work-order/created'),
  WORK_ORDER_SCHEDULED: t(ENTERPRISE, 'erp/work-order/scheduled'),
  WORK_ORDER_RELEASED: t(ENTERPRISE, 'erp/work-order/released'),
  WORK_ORDER_COMPLETED: t(ENTERPRISE, 'erp/work-order/completed'),
  MATERIAL_ALLOCATED: t(ENTERPRISE, 'erp/material/allocated'),
  INVENTORY_LEVEL: t(ENTERPRISE, 'erp/inventory/level'),
};

// ─── LEVEL 3: MES / MANUFACTURING OPS (site) ─────────────────
export const MES = {
  PRODUCTION_STARTED: t(SITE, 'mes/production/started'),
  PRODUCTION_STEP_BEGUN: t(SITE, 'mes/production/step-begun'),
  PRODUCTION_STEP_COMPLETE: t(SITE, 'mes/production/step-complete'),
  PRODUCTION_COMPLETE: t(SITE, 'mes/production/complete'),
  ORDER_COMPLETED: t(SITE, 'mes/order/completed'),
  OEE_UPDATE: t(SITE, 'mes/oee/update'),
  QUALITY_CHECK: t(SITE, 'mes/quality/check'),
  BATCH_STATUS: t(SITE, 'mes/batch/status'),
};

// ─── LEVEL 2: SCADA / SUPERVISORY CONTROL (line) ─────────────
export const SCADA = {
  SENSOR_READING: t(LINE, 'scada/sensor/reading'),
  CONVEYOR_STATUS: t(LINE, 'scada/conveyor/status'),
  ALARM_RAISED: t(LINE, 'scada/alarm/raised'),
  ALARM_ACKNOWLEDGED: t(LINE, 'scada/alarm/acknowledged'),
  PROCESS_VALUE: t(LINE, 'scada/process/value'),
  LINE_STATUS: t(LINE, 'scada/line/status'),
};

// ─── LEVEL 0-1: ARM / FIELD CONTROL (line) ───────────────────
// The 6 SO-101 follower motors, in physical joint order. Each motor
// publishes its own telemetry on candyfactory/paris/packing/line1/arm/<motor>
// so every servo is independently observable on the UNS.
export const ARM_MOTORS = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
];

export const ARM = {
  COMMAND: t(LINE, 'arm/command'),
  TELEMETRY: t(LINE, 'arm/telemetry'),
  STATUS: t(LINE, 'arm/status'),
  HITL_REQUIRED: t(LINE, 'hitl/approval-required'),
  HITL_APPROVED: t(LINE, 'hitl/approved'),
  // Per-motor telemetry topics, keyed by motor name.
  MOTOR: Object.fromEntries(
    ARM_MOTORS.map((m) => [m, t(LINE, `arm/${m}`)])
  ),
};

// ─── SAM — SOLACE AGENT MESH (enterprise-wide autonomous ops) ─
// SAM observes the whole UNS and publishes its reasoning + corrective
// actions. It sits at the enterprise level because it reasons across
// every site/line, not one piece of equipment.
export const SAM = {
  INCIDENT_DETECTED: t(ENTERPRISE, 'sam/incident/detected'),   // an agent spotted a problem
  AGENT_REASONING: t(ENTERPRISE, 'sam/agent/reasoning'),       // an agent's plan/thought
  ACTION_TAKEN: t(ENTERPRISE, 'sam/action/taken'),             // corrective event published
  INCIDENT_RESOLVED: t(ENTERPRISE, 'sam/incident/resolved'),   // problem closed out
};

// ─── CHAOS — injected disruptions (the problems SAM solves) ───
// Chaos events are deliberately faulty/anomalous events published across
// the UNS. They render RED in the feed and are what the SAM agents
// subscribe to and resolve. The topic namespace mirrors where the fault
// actually occurs, but every chaos event carries payload.chaos = true so
// the UI can flag it regardless of layer.
export const CHAOS = {
  RAISED: t(ENTERPRISE, 'chaos/raised'),   // meta-event announcing an injected disruption
};

// ─── SYSTEM / DEMO ORCHESTRATION (not part of the visible UNS) ─
// Used for leader-election so exactly one open kiosk drives the
// simulated cascade even when multiple screens/phones are connected.
export const SYSTEM = {
  SIM_HEARTBEAT: t(ROOT, '_sim/heartbeat'),
};

// Wildcard subscription prefixes per layer (single source of truth).
export const WILDCARDS = {
  ALL: `${ROOT}/>`,
  ORDERS: `${ENTERPRISE}/orders/`,
  ERP: `${ENTERPRISE}/erp/`,
  MES: `${SITE}/mes/`,
  SCADA: `${LINE}/scada/`,
  ARM: `${LINE}/arm/`,
  HITL: `${LINE}/hitl/`,
  SAM: `${ENTERPRISE}/sam/`,
  CHAOS: `${ENTERPRISE}/chaos/`,
};

// Location prefixes, exported for tree rendering / short-topic display.
export const PREFIXES = { ROOT, ENTERPRISE, SITE, LINE };

/**
 * Strip the location prefix from a topic for compact display, leaving the
 * system-relative path (e.g. "orders/created", "scada/sensor/reading").
 */
export function shortTopic(fullTopic = '') {
  return fullTopic
    .replace(`${LINE}/`, '')
    .replace(`${SITE}/`, '')
    .replace(`${ENTERPRISE}/`, '')
    .replace(`${ROOT}/`, '');
}

// All topics flat (for reference)
export const ALL_TOPICS = { ...MARKETPLACE, ...ERP, ...MES, ...SCADA, ...ARM, ...SAM, ...CHAOS };
