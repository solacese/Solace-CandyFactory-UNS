import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3005 },
  resolve: {
    alias: {
      'node:crypto': new URL('./src/polyfills/crypto-browser.js', import.meta.url).pathname,
    },
  },
});
