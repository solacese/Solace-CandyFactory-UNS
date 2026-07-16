/**
 * Load and validate Solace broker configuration from environment variables.
 * Fails loudly with a specific message if any required var is missing.
 */

const REQUIRED_VARS = ['SOLACE_HOST', 'SOLACE_VPN', 'SOLACE_USERNAME', 'SOLACE_PASSWORD'];

export function loadConfig() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    const msg = [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║  MISSING REQUIRED ENVIRONMENT VARIABLES                     ║',
      '╠══════════════════════════════════════════════════════════════╣',
      ...missing.map((v) => `║  • ${v.padEnd(56)}║`),
      '╠══════════════════════════════════════════════════════════════╣',
      '║  Copy .env.example to .env and fill in your Solace broker   ║',
      '║  connection details. Do NOT use a mock broker.              ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
    ].join('\n');
    console.error(msg);
    process.exit(1);
  }

  return {
    host: process.env.SOLACE_HOST,
    vpn: process.env.SOLACE_VPN,
    username: process.env.SOLACE_USERNAME,
    password: process.env.SOLACE_PASSWORD,
  };
}
