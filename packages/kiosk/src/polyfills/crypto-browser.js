// Polyfill for node:crypto — provides randomUUID for browser use
export function randomUUID() {
  return crypto.randomUUID();
}

export default { randomUUID };
