import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves the kiosk under /<repo>/, so the built asset URLs must be
// prefixed. Overridable via VITE_BASE for other hosts; defaults to root for the
// local dev server and the on-site booth build.
const base = process.env.VITE_BASE || '/';

// Sim-only build (GitHub Pages): redirect every import of broker/connection.js
// to the in-browser loopback broker so the demo runs with no network. The
// SimulationEngine and every tab are untouched — they still import the same
// module specifier; only what it resolves to changes. Selected via VITE_LOOPBACK.
const loopback = process.env.VITE_LOOPBACK === '1';

/** Rewrites any resolved path ending in broker/connection.js -> connection.loopback.js */
function loopbackBrokerPlugin() {
  return {
    name: 'kiosk-loopback-broker',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.includes('connection')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved && /broker[\\/]connection\.js$/.test(resolved.id)) {
        return resolved.id.replace(/connection\.js$/, 'connection.loopback.js');
      }
      return null;
    },
  };
}

export default defineConfig({
  base,
  // Expose the build mode to app code. Pages (loopback) shows the video feed;
  // local/booth (non-loopback) shows the live 3D arm. Static replacement lets
  // the bundler tree-shake the unused branch (three.js drops from the Pages build).
  define: {
    __LOOPBACK__: JSON.stringify(loopback),
  },
  plugins: [react(), tailwindcss(), ...(loopback ? [loopbackBrokerPlugin()] : [])],
  server: { port: 3005 },
  resolve: {
    alias: {
      'node:crypto': new URL('./src/polyfills/crypto-browser.js', import.meta.url).pathname,
    },
  },
});
