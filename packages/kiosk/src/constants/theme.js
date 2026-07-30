/**
 * Light + pink design tokens — high contrast.
 * Accent: #db2777 (pink-600), soft #f472b6 (pink-400).
 * Text ("ink") is a near-black plum for strong legibility on light surfaces.
 */

export const BRAND = {
  bg: '#fce7f2',
  surface: '#ffffff',
  border: 'rgba(190,24,93,0.32)',
  text: '#2a0f22',
  textDim: 'rgba(42,15,34,0.78)',
  textMuted: 'rgba(42,15,34,0.55)',
  accent: '#db2777',
  accentSoft: '#f472b6',
};

export const LEVELS = {
  5: { label: 'Level 5 — Commerce', color: '#db2777' },
  4: { label: 'Level 4 — ERP', color: '#c026d3' },
  3: { label: 'Level 3 — MES', color: '#9333ea' },
  2: { label: 'Level 2 — SCADA', color: '#7c3aed' },
  1: { label: 'Level 0-1 — Control', color: '#4f46e5' },
};

// Deeper, distinguishable hues per UNS layer — pink→violet family.
export const TOPIC_COLORS = {
  orders: '#db2777',
  erp: '#c026d3',
  mes: '#9333ea',
  scada: '#7c3aed',
  arm: '#4f46e5',
  hitl: '#e11d48',
};

export const TOPIC_CATEGORIES = ['orders', 'erp', 'mes', 'scada', 'arm', 'hitl'];
