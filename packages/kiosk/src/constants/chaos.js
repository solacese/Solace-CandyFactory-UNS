/**
 * Chaos library — the disruptions SAM resolves.
 *
 * Each entry is a self-contained story:
 *   1. A fault is INJECTED as a red event somewhere on the UNS.
 *   2. A SAM agent DETECTS it (agent mesh subscribes to the whole UNS).
 *   3. The agent REASONS about it (one plain-language line, LLM-style).
 *   4. The agent TAKES a corrective ACTION — a real follow-up event
 *      (new order, maintenance work order, restock, re-route, …).
 *   5. SAM marks the incident RESOLVED.
 *
 * The SimulationEngine plays this timeline out over ~a few seconds so a
 * passer-by can watch a problem appear in red and an autonomous agent
 * clear it. Everything is scripted — no LLM, no network — so it is
 * instant and reliable at a booth, yet reads exactly like agentic AI.
 *
 * `resolveMs` is how long the agent "thinks" before acting.
 * `fix.topic` / `fix.payload(ctx)` is the corrective event that closes it.
 *
 * Layers use the same category keys as the feed filters
 * (orders | erp | mes | scada | arm | hitl) so the red flag lights up the
 * right topic in the tree.
 */

import { MARKETPLACE, ERP, MES, SCADA, ARM } from './topics.js';
import { SWEETS, FAKE_CUSTOMERS } from './demo-data.js';

// ─── The four SAM agents (mirror the real agent mesh) ──────────────
export const SAM_AGENTS = [
  { id: 'order-agent', name: 'Order Agent', role: 'Validates & repairs orders', color: '#00c895' },
  { id: 'inventory-agent', name: 'Inventory Agent', role: 'Guards stock & reservations', color: '#059669' },
  { id: 'ops-agent', name: 'Ops Agent', role: 'MES / production recovery', color: '#0d9488' },
  { id: 'maintenance-agent', name: 'Maintenance Agent', role: 'SCADA / arm health', color: '#0369a1' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randSweet = () => pick(SWEETS);

// ─── Disruption library (12) ───────────────────────────────────────
// Every `inject.payload` MUST carry `chaos: true` so the feed flags it red.
export const CHAOS_LIBRARY = [
  // 1 ── Malformed order (missing email) — Order Agent repairs it
  {
    id: 'order-missing-email',
    label: 'Malformed order — missing email',
    layer: 'orders',
    severity: 'warning',
    agent: 'order-agent',
    inject: {
      topic: MARKETPLACE.ORDER_CREATED,
      source: 'chaos-injector',
      payload: () => ({
        chaos: true,
        orderId: `ORD-BAD-${Math.floor(Math.random() * 9999)}`,
        customer: { name: pick(FAKE_CUSTOMERS).name, email: null },
        items: [{ sweetType: randSweet().id, quantity: 3 }],
        error: 'VALIDATION_FAILED: email is required',
      }),
    },
    detect: 'Order rejected — email field is null.',
    reasoning: 'Order Agent: email missing. Enriching from CRM and re-submitting a valid order.',
    resolveMs: 2200,
    fix: {
      topic: MARKETPLACE.ORDER_CREATED,
      source: 'sam-order-agent',
      payload: (ctx) => {
        const c = pick(FAKE_CUSTOMERS);
        return {
          orderId: `ORD-FIX-${Math.floor(Math.random() * 9999)}`,
          customer: c,
          items: [{ sweetType: randSweet().id, quantity: 3 }],
          priority: 'medium',
          source: 'sam-repair',
          repairedFrom: ctx.incidentId,
        };
      },
    },
  },

  // 2 ── Out of stock — Inventory Agent raises a restock work order
  {
    id: 'inventory-out-of-stock',
    label: 'Out of stock during pick',
    layer: 'erp',
    severity: 'critical',
    agent: 'inventory-agent',
    inject: {
      topic: ERP.INVENTORY_LEVEL,
      source: 'chaos-injector',
      payload: () => {
        const s = randSweet();
        return { chaos: true, sweetType: s.id, sweetName: s.name, onHand: 0, capacity: 600, level: 'unavailable', error: 'STOCK_DEPLETED' };
      },
    },
    detect: 'Inventory depleted — a sweet hit zero on-hand.',
    reasoning: 'Inventory Agent: on-hand = 0. Issuing an emergency restock work order to replenish the bin.',
    resolveMs: 2600,
    fix: {
      topic: ERP.MATERIAL_ALLOCATED,
      source: 'sam-inventory-agent',
      payload: () => {
        const s = randSweet();
        return { restock: true, sweetType: s.id, sweetName: s.name, replenished: 400, bin: s.bin, note: 'Emergency restock dispatched' };
      },
    },
  },

  // 3 ── Wrong item picked — Ops Agent triggers a rework order
  {
    id: 'mes-wrong-item',
    label: 'Wrong item picked',
    layer: 'mes',
    severity: 'warning',
    agent: 'ops-agent',
    inject: {
      topic: MES.QUALITY_CHECK,
      source: 'chaos-injector',
      payload: () => {
        const wanted = randSweet();
        let got = randSweet();
        while (got.id === wanted.id) got = randSweet();
        return { chaos: true, result: 'fail', checkType: 'wrong-sku', expected: wanted.name, actual: got.name, error: 'SKU_MISMATCH' };
      },
    },
    detect: 'Quality check failed — picked SKU does not match the order.',
    reasoning: 'Ops Agent: SKU mismatch on the line. Scheduling a rework pick to place the correct sweet.',
    resolveMs: 2400,
    fix: {
      topic: MES.PRODUCTION_STEP_BEGUN,
      source: 'sam-ops-agent',
      payload: () => ({ rework: true, stepName: 'rework-correct-sku', note: 'Re-picking correct SKU' }),
    },
  },

  // 4 ── Conveyor jam — Maintenance Agent dispatches a maintenance WO
  {
    id: 'scada-conveyor-jam',
    label: 'Conveyor jam',
    layer: 'scada',
    severity: 'critical',
    agent: 'maintenance-agent',
    inject: {
      topic: SCADA.ALARM_RAISED,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, alarmCode: 'ALM-CONVEYOR-JAM', message: 'Conveyor belt jam detected', severity: 'critical', sensor: 'SPEED-01', triggeredValue: 0 }),
    },
    detect: 'Critical alarm — conveyor belt jammed, line stopped.',
    reasoning: 'Maintenance Agent: belt speed dropped to 0. Dispatching maintenance and requesting line restart.',
    resolveMs: 2800,
    fix: {
      topic: SCADA.CONVEYOR_STATUS,
      source: 'sam-maintenance-agent',
      payload: () => ({ speed: 1.2, unit: 'm/s', status: 'running', recovered: true, note: 'Jam cleared, belt restarted' }),
    },
  },

  // 5 ── Arm fault — Maintenance Agent recovers the arm to home
  {
    id: 'arm-motor-fault',
    label: 'Arm motor fault',
    layer: 'arm',
    severity: 'critical',
    agent: 'maintenance-agent',
    inject: {
      topic: ARM.STATUS,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, status: 'fault', detail: 'Joint 3 over-current — motion halted', error: 'MOTOR_OVERCURRENT' }),
    },
    detect: 'Arm fault — joint over-current, motion halted mid-pick.',
    reasoning: 'Maintenance Agent: over-current on joint 3. Homing the arm and clearing the fault to resume safely.',
    resolveMs: 2600,
    fix: {
      topic: ARM.STATUS,
      source: 'sam-maintenance-agent',
      payload: () => ({ status: 'idle', detail: 'Fault cleared — arm homed', recovered: true }),
    },
  },

  // 6 ── Temperature excursion — Maintenance Agent adjusts setpoint
  {
    id: 'scada-temp-excursion',
    label: 'Temperature excursion',
    layer: 'scada',
    severity: 'warning',
    agent: 'maintenance-agent',
    inject: {
      topic: SCADA.SENSOR_READING,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, sensorId: 'TEMP-01', type: 'temperature', value: 41.7, unit: '°C', location: 'Conveyor Intake', error: 'TEMP_OUT_OF_BAND' }),
    },
    detect: 'Temperature 41.7°C — well above the 26°C limit.',
    reasoning: 'Maintenance Agent: intake overheating. Engaging chiller and lowering the setpoint to protect the gummies.',
    resolveMs: 2300,
    fix: {
      topic: SCADA.PROCESS_VALUE,
      source: 'sam-maintenance-agent',
      payload: () => ({ sensorId: 'TEMP-01', setpoint: 23.5, action: 'chiller-engaged', recovered: true, note: 'Cooling to setpoint' }),
    },
  },

  // 7 ── Duplicate order — Order Agent dedupes it
  {
    id: 'order-duplicate',
    label: 'Duplicate order submitted',
    layer: 'orders',
    severity: 'warning',
    agent: 'order-agent',
    inject: {
      topic: MARKETPLACE.ORDER_CREATED,
      source: 'chaos-injector',
      payload: () => {
        const c = pick(FAKE_CUSTOMERS);
        return { chaos: true, orderId: 'ORD-DUP-7781', customer: c, items: [{ sweetType: randSweet().id, quantity: 2 }], duplicate: true, error: 'DUPLICATE_SUBMISSION' };
      },
    },
    detect: 'Duplicate order — same reference submitted twice.',
    reasoning: 'Order Agent: duplicate detected within the idempotency window. Cancelling the copy, keeping the original.',
    resolveMs: 1900,
    fix: {
      topic: MARKETPLACE.ORDER_REJECTED,
      source: 'sam-order-agent',
      payload: () => ({ orderId: 'ORD-DUP-7781', reason: 'duplicate-cancelled', keptOriginal: true, note: 'Duplicate cancelled' }),
    },
  },

  // 8 ── Negative / bad quantity — Order Agent clamps it
  {
    id: 'order-bad-quantity',
    label: 'Invalid quantity (negative)',
    layer: 'orders',
    severity: 'warning',
    agent: 'order-agent',
    inject: {
      topic: MARKETPLACE.ORDER_CREATED,
      source: 'chaos-injector',
      payload: () => {
        const c = pick(FAKE_CUSTOMERS);
        return { chaos: true, orderId: `ORD-QTY-${Math.floor(Math.random() * 9999)}`, customer: c, items: [{ sweetType: randSweet().id, quantity: -5 }], error: 'INVALID_QUANTITY' };
      },
    },
    detect: 'Order rejected — negative quantity (-5).',
    reasoning: 'Order Agent: quantity out of range. Clamping to a valid value and re-submitting the order.',
    resolveMs: 2000,
    fix: {
      topic: MARKETPLACE.ORDER_CREATED,
      source: 'sam-order-agent',
      payload: () => {
        const c = pick(FAKE_CUSTOMERS);
        return { orderId: `ORD-FIX-${Math.floor(Math.random() * 9999)}`, customer: c, items: [{ sweetType: randSweet().id, quantity: 3 }], source: 'sam-repair', note: 'Quantity clamped to 3' };
      },
    },
  },

  // 9 ── Stuck work order (no progress) — Ops Agent re-releases it
  {
    id: 'erp-stuck-work-order',
    label: 'Work order stalled',
    layer: 'erp',
    severity: 'warning',
    agent: 'ops-agent',
    inject: {
      topic: ERP.WORK_ORDER_SCHEDULED,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, workOrderId: `WO-STUCK-${Math.floor(Math.random() * 999)}`, status: 'stalled', ageMin: 14, error: 'NO_PROGRESS_TIMEOUT' }),
    },
    detect: 'Work order stalled — scheduled but no production for 14 min.',
    reasoning: 'Ops Agent: stalled WO detected. Re-releasing it to the line and bumping its priority.',
    resolveMs: 2500,
    fix: {
      topic: ERP.WORK_ORDER_RELEASED,
      source: 'sam-ops-agent',
      payload: () => ({ workOrderId: `WO-STUCK-${Math.floor(Math.random() * 999)}`, status: 'released', priority: 'high', recovered: true, note: 'Re-released to line' }),
    },
  },

  // 10 ── Quality drift (defect spike) — Ops Agent recalibrates
  {
    id: 'mes-defect-spike',
    label: 'Defect rate spike',
    layer: 'mes',
    severity: 'warning',
    agent: 'ops-agent',
    inject: {
      topic: MES.OEE_UPDATE,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, availability: 74, performance: 61, quality: 79, oee: 35.6, defectRate: 6.2, error: 'QUALITY_DRIFT' }),
    },
    detect: 'Quality dropped to 79%, defect rate spiked to 6.2%.',
    reasoning: 'Ops Agent: quality trending down. Triggering fill-station recalibration to bring defects back in band.',
    resolveMs: 2700,
    fix: {
      topic: MES.QUALITY_CHECK,
      source: 'sam-ops-agent',
      payload: () => ({ checkType: 'recalibration', result: 'pass', confidence: 0.98, recovered: true, note: 'Fill station recalibrated' }),
    },
  },

  // 11 ── Pressure loss — Maintenance Agent restores pneumatics
  {
    id: 'scada-pressure-loss',
    label: 'Pneumatic pressure loss',
    layer: 'scada',
    severity: 'critical',
    agent: 'maintenance-agent',
    inject: {
      topic: SCADA.ALARM_RAISED,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, alarmCode: 'ALM-LOW-PRESS', message: 'Pneumatic pressure critically low', severity: 'critical', sensor: 'PRESS-01', triggeredValue: 0.3 }),
    },
    detect: 'Critical alarm — pneumatic pressure at 0.3 bar (min 0.8).',
    reasoning: 'Maintenance Agent: gripper air pressure lost. Switching to the backup compressor to restore grip.',
    resolveMs: 2600,
    fix: {
      topic: SCADA.PROCESS_VALUE,
      source: 'sam-maintenance-agent',
      payload: () => ({ sensorId: 'PRESS-01', value: 1.2, unit: 'bar', action: 'backup-compressor', recovered: true, note: 'Pressure restored' }),
    },
  },

  // 12 ── HITL approval timeout — Ops Agent re-requests approval
  {
    id: 'hitl-approval-timeout',
    label: 'HITL approval timed out',
    layer: 'hitl',
    severity: 'warning',
    agent: 'ops-agent',
    inject: {
      topic: ARM.HITL_REQUIRED,
      source: 'chaos-injector',
      payload: () => ({ chaos: true, action: 'Pick sequence awaiting approval', status: 'timeout', ageSec: 90, error: 'APPROVAL_TIMEOUT' }),
    },
    detect: 'Human approval request timed out after 90s — line idle.',
    reasoning: 'Ops Agent: approval stale. Re-issuing the request and paging the on-shift operator.',
    resolveMs: 2200,
    fix: {
      topic: ARM.HITL_REQUIRED,
      source: 'sam-ops-agent',
      payload: () => ({ action: 'Re-requesting operator approval', reason: 'Previous request timed out — operator paged', reissued: true }),
    },
  },
];

/** Look up the agent metadata that owns a given chaos entry. */
export function agentFor(chaosId) {
  const c = CHAOS_LIBRARY.find((x) => x.id === chaosId);
  return SAM_AGENTS.find((a) => a.id === c?.agent) || SAM_AGENTS[0];
}

/** Pick a random disruption from the library. */
export function randomChaos() {
  return CHAOS_LIBRARY[Math.floor(Math.random() * CHAOS_LIBRARY.length)];
}
