/**
 * Generate QR code pointing to the ordering page.
 * Outputs SVG and PNG to the assets/ directory.
 * Usage: node src/generate-qr.mjs [URL]
 */
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, '../../../assets');

const url = process.argv[2] || 'http://localhost:3000';

console.log(`Generating QR code for: ${url}`);

// SVG
const svg = await QRCode.toString(url, {
  type: 'svg',
  width: 400,
  margin: 2,
  color: { dark: '#FF6B6B', light: '#FFFFFF' },
});
writeFileSync(resolve(assetsDir, 'qr-code.svg'), svg);
console.log(`  -> assets/qr-code.svg`);

// PNG (data URL for reference)
const dataUrl = await QRCode.toDataURL(url, {
  width: 400,
  margin: 2,
  color: { dark: '#FF6B6B', light: '#FFFFFF' },
});
const base64 = dataUrl.split(',')[1];
writeFileSync(resolve(assetsDir, 'qr-code.png'), Buffer.from(base64, 'base64'));
console.log(`  -> assets/qr-code.png`);

console.log('\nDone! Print the QR code and place it at the demo station.');
