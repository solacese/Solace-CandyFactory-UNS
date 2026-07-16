/**
 * Terminal B&W design tokens.
 * Single accent color: #00C895 (green) used sparingly for live/active indicators.
 */

export const BRAND = {
  bg: '#0a0a0a',
  surface: '#111111',
  border: 'rgba(255,255,255,0.1)',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.5)',
  textMuted: 'rgba(255,255,255,0.3)',
  accent: '#00C895',
};

export const LEVELS = {
  5: { label: 'Level 5 — Commerce', color: '#ffffff' },
  4: { label: 'Level 4 — ERP', color: '#ffffff' },
  3: { label: 'Level 3 — MES', color: '#ffffff' },
  2: { label: 'Level 2 — SCADA', color: '#ffffff' },
  1: { label: 'Level 0-1 — Control', color: '#ffffff' },
};

export const TOPIC_COLORS = {
  orders: '#ffffff',
  erp: '#ffffff',
  mes: '#ffffff',
  scada: '#ffffff',
  arm: '#ffffff',
  hitl: '#ffffff',
};

export const TOPIC_CATEGORIES = ['orders', 'erp', 'mes', 'scada', 'arm', 'hitl'];
