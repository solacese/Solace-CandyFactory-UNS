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

export const LEVELS = {
  5: { label: 'Level 5 — Commerce', color: '#00c895' },
  4: { label: 'Level 4 — ERP', color: '#059669' },
  3: { label: 'Level 3 — MES', color: '#0d9488' },
  2: { label: 'Level 2 — SCADA', color: '#0891b2' },
  1: { label: 'Level 0-1 — Control', color: '#0369a1' },
};

// Deeper, distinguishable hues per UNS layer — green→teal→cyan family.
export const TOPIC_COLORS = {
  orders: '#00c895',
  erp: '#059669',
  mes: '#0d9488',
  scada: '#0891b2',
  arm: '#0369a1',
  hitl: '#f59e0b',
};

export const TOPIC_CATEGORIES = ['orders', 'erp', 'mes', 'scada', 'arm', 'hitl'];
