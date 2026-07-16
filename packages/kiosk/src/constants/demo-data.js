/**
 * Demo data — sweets catalog, fake customers, sensors.
 */

export const SWEETS = [
  { id: 'goldbears', name: 'Goldbears', emoji: '🐻', bin: 1, color: '#FFD700' },
  { id: 'happy-cola', name: 'Happy Cola', emoji: '🥤', bin: 2, color: '#8B4513' },
  { id: 'starmix', name: 'Starmix', emoji: '⭐', bin: 3, color: '#FF69B4' },
  { id: 'tangfastics', name: 'Tangfastics', emoji: '🍋', bin: 4, color: '#32CD32' },
];

export const FAKE_CUSTOMERS = [
  { name: 'Claire Dupont', email: 'claire.dupont@acme-mfg.com' },
  { name: 'Marco Rossi', email: 'marco.rossi@techcorp.io' },
  { name: 'Hans Weber', email: 'hans.weber@siemens.de' },
  { name: 'Sarah Jones', email: 'sarah.jones@rockwell.com' },
  { name: 'Yuki Tanaka', email: 'yuki.tanaka@fanuc.co.jp' },
  { name: 'Pierre Martin', email: 'pierre.martin@schneider.fr' },
  { name: 'Emma Wilson', email: 'emma.wilson@solace.com' },
  { name: 'Raj Patel', email: 'raj.patel@honeywell.com' },
];

export const SENSORS = [
  { id: 'TEMP-01', type: 'temperature', unit: '°C', base: 23.5, noise: 0.8, min: 18, max: 30, location: 'Conveyor Intake' },
  { id: 'PRESS-01', type: 'pressure', unit: 'bar', base: 1.2, noise: 0.05, min: 0.8, max: 1.8, location: 'Pneumatic Line' },
  { id: 'VIBR-01', type: 'vibration', unit: 'g', base: 0.6, noise: 0.3, min: 0, max: 3.0, location: 'Pick Motor' },
  { id: 'WEIGHT-01', type: 'weight', unit: 'g', base: 125, noise: 15, min: 0, max: 500, location: 'Fill Station' },
  { id: 'HUMID-01', type: 'humidity', unit: '%RH', base: 45, noise: 2, min: 30, max: 70, location: 'Packaging Area' },
  { id: 'SPEED-01', type: 'speed', unit: 'm/s', base: 1.2, noise: 0.1, min: 0, max: 2.0, location: 'Conveyor Belt' },
];

export const ALARM_TYPES = [
  { code: 'ALM-HIGH-TEMP', message: 'Temperature above threshold', severity: 'warning', sensor: 'TEMP-01' },
  { code: 'ALM-HIGH-VIBR', message: 'Vibration exceeds limit', severity: 'critical', sensor: 'VIBR-01' },
  { code: 'ALM-CONVEYOR-JAM', message: 'Conveyor belt jam detected', severity: 'critical', sensor: 'SPEED-01' },
  { code: 'ALM-LOW-PRESS', message: 'Pneumatic pressure low', severity: 'warning', sensor: 'PRESS-01' },
];

export const PRIORITIES = ['high', 'medium', 'low'];

// Work order counter
let woSeq = 41;
export function nextWorkOrderId() {
  return `WO-2024-${String(++woSeq).padStart(5, '0')}`;
}

export function randomCustomer() {
  return FAKE_CUSTOMERS[Math.floor(Math.random() * FAKE_CUSTOMERS.length)];
}

export function randomSweets() {
  const count = Math.floor(Math.random() * 3) + 1;
  const shuffled = [...SWEETS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((s) => ({
    sweetType: s.id,
    quantity: Math.floor(Math.random() * 4) + 1,
  }));
}
