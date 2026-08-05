/**
 * Light + green (Solace) design tokens — high contrast.
 * Accent: #00c895 (Solace green), soft #5eead4 (teal-300).
 * Text ("ink") is a near-black green for strong legibility on light surfaces.
 */

export const BRAND = {
  bg: '#e6faf3',
  surface: '#ffffff',
  border: 'rgba(6,120,90,0.32)',
  text: '#052e22',
  textDim: 'rgba(5,46,34,0.78)',
  textMuted: 'rgba(5,46,34,0.55)',
  accent: '#00c895',
  accentSoft: '#5eead4',
};

// Numbered by demo flow / tab order (1 = Marketplace … 5 = Arm), not by
// the ISA-95 level index. Colors run green→blue across the stack.
export const LEVELS = {
  1: { label: 'Level 1 — Commerce', color: '#00c895' },
  2: { label: 'Level 2 — ERP', color: '#059669' },
  3: { label: 'Level 3 — MES', color: '#0d9488' },
  4: { label: 'Level 4 — SCADA', color: '#0891b2' },
  5: { label: 'Level 5 — Control', color: '#0369a1' },
};

// Deeper, distinguishable hues per UNS layer — green→teal→cyan family.
// SAM sits off the ISA ladder (autonomous ops) so it gets a violet accent;
// chaos is always red so injected faults are unmistakable in the feed.
export const TOPIC_COLORS = {
  orders: '#00c895',
  erp: '#059669',
  mes: '#0d9488',
  scada: '#0891b2',
  arm: '#0369a1',
  hitl: '#f59e0b',
  sam: '#7c3aed',
  chaos: '#ef4444',
};

// Feed filter chips + tree leaves. `chaos` is intentionally omitted from the
// tree (it's a cross-cutting fault flag, not a UNS location) but included as a
// feed filter so an operator can isolate disruptions.
export const TOPIC_CATEGORIES = ['orders', 'erp', 'mes', 'scada', 'arm', 'hitl', 'sam'];

// ─── Status colors (KPI / sensor vs target) ────────────────────
// Shared by MES stats and SCADA sensors so "on-target / warning / bad"
// reads the same everywhere.
export const STATUS_COLORS = {
  good: '#00c895',   // Solace green — on or better than target
  warn: '#f59e0b',   // amber — drifting toward the limit
  bad: '#ef4444',    // red — out of target
  idle: '#052e22',   // neutral ink
};

/**
 * Grade a live value against a target.
 * @param {number} value  live reading
 * @param {number} target target/setpoint
 * @param {'higher'|'lower'} dir which direction is "good"
 * @param {number} warnBand fractional slack (of target) before red
 * @returns {'good'|'warn'|'bad'}
 */
export function gradeVsTarget(value, target, dir = 'higher', warnBand = 0.1) {
  if (value == null || target == null || Number.isNaN(value)) return 'warn';
  const slack = Math.abs(target) * warnBand;
  if (dir === 'higher') {
    if (value >= target) return 'good';
    if (value >= target - slack) return 'warn';
    return 'bad';
  }
  // lower is better
  if (value <= target) return 'good';
  if (value <= target + slack) return 'warn';
  return 'bad';
}

/** Grade a value against a [lo, hi] normal band (SCADA sensors). */
export function gradeVsBand(value, lo, hi) {
  if (value == null || Number.isNaN(value)) return 'warn';
  if (value >= lo && value <= hi) return 'good';
  const margin = (hi - lo) * 0.15 || 1;
  if (value >= lo - margin && value <= hi + margin) return 'warn';
  return 'bad';
}

/** Level → color for inventory badges (marketplace). */
export const LEVEL_COLORS = {
  high: '#00c895',
  medium: '#f59e0b',
  low: '#ef4444',
  unavailable: '#94a3b8',
};
