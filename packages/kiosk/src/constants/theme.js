/**
 * Solace brand tokens + ISA-95 level colors.
 */

export const BRAND = {
  dark: '#03213B',
  green: '#00C895',
  blue: '#0054A6',
  white: '#FFFFFF',
  light: '#F0F4F8',
};

export const LEVELS = {
  5: { label: 'Level 5 — Commerce', color: '#6366F1', icon: '🛒' },
  4: { label: 'Level 4 — ERP', color: '#8B5CF6', icon: '📊' },
  3: { label: 'Level 3 — MES', color: '#F59E0B', icon: '⚙️' },
  2: { label: 'Level 2 — SCADA', color: '#EF4444', icon: '🖥️' },
  1: { label: 'Level 0-1 — Control', color: '#10B981', icon: '🦾' },
};

export const TOPIC_COLORS = {
  orders: '#6366F1',
  erp: '#8B5CF6',
  mes: '#F59E0B',
  scada: '#EF4444',
  arm: '#10B981',
  hitl: '#EC4899',
};
