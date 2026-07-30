/**
 * Light + pink design tokens.
 * Accent: #ec4899 (pink-500), soft #f9a8d4 (pink-300).
 * Text ("ink") is a soft plum rather than pure black to keep the UI light-weight.
 */

export const BRAND = {
  bg: '#fdf2f8',
  surface: '#ffffff',
  border: 'rgba(236,72,153,0.16)',
  text: '#3b1f33',
  textDim: 'rgba(59,31,51,0.6)',
  textMuted: 'rgba(59,31,51,0.38)',
  accent: '#ec4899',
  accentSoft: '#f9a8d4',
};

export const LEVELS = {
  5: { label: 'Level 5 — Commerce', color: '#ec4899' },
  4: { label: 'Level 4 — ERP', color: '#d946ef' },
  3: { label: 'Level 3 — MES', color: '#a855f7' },
  2: { label: 'Level 2 — SCADA', color: '#8b5cf6' },
  1: { label: 'Level 0-1 — Control', color: '#6366f1' },
};

// Soft, distinguishable hues per UNS layer — all in the pink→violet family.
export const TOPIC_COLORS = {
  orders: '#ec4899',
  erp: '#d946ef',
  mes: '#a855f7',
  scada: '#8b5cf6',
  arm: '#6366f1',
  hitl: '#f43f5e',
};

export const TOPIC_CATEGORIES = ['orders', 'erp', 'mes', 'scada', 'arm', 'hitl'];
