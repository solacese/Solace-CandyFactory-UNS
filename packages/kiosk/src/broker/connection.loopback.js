/**
 * In-browser loopback "broker" for the Kiosk.
 *
 * Drop-in replacement for connection.js that keeps the exact same public API
 * (connectBroker / subscribeTopic / onMessage / publishMessage / getStatus /
 * onStatusChange) but routes every published message straight back to the
 * registered handlers in-process — no WebSocket, no Solace, no network.
 *
 * This is what powers the static GitHub Pages demo: the SimulationEngine
 * publishes exactly as it would against a real broker, and the tabs receive
 * exactly as they would, so the UI is byte-for-byte identical to the live
 * booth build. Selected at build time via the VITE_LOOPBACK flag (see
 * vite.config.js), so the real broker path is untouched for on-site use.
 */

let status = 'disconnected';
const messageHandlers = [];
const statusHandlers = [];

function setStatus(s) {
  status = s;
  statusHandlers.forEach((h) => h(s));
}

export function getStatus() {
  return status;
}

export function onStatusChange(handler) {
  statusHandlers.push(handler);
  return () => {
    const idx = statusHandlers.indexOf(handler);
    if (idx >= 0) statusHandlers.splice(idx, 1);
  };
}

/**
 * "Connect" — resolves on the next tick so the SimulationEngine start-up
 * (gated on status === 'connected' in App.jsx) fires just like the real path.
 */
export function connectBroker() {
  if (status === 'connected') return Promise.resolve();
  setStatus('connecting');
  return new Promise((resolve) => {
    setTimeout(() => {
      setStatus('connected');
      console.log('[kiosk] Loopback broker active (sim-only, no network)');
      resolve();
    }, 0);
  });
}

/**
 * Subscribe is a no-op here: the kiosk subscribes with the broad 'haribot/>'
 * filter and every simulated topic lives under 'haribot/', so a real broker
 * would fan every message out to this session anyway. The consuming hooks
 * (useSubscription / useAllEvents) already prefix-filter client-side, so the
 * loopback just delivers everything and lets them decide.
 */
export function subscribeTopic() {
  /* no-op — deliver-all, see publishMessage */
}

export function onMessage(handler) {
  messageHandlers.push(handler);
  return () => {
    const idx = messageHandlers.indexOf(handler);
    if (idx >= 0) messageHandlers.splice(idx, 1);
  };
}

/**
 * Publish — deliver to every handler whose subscription matches, on a
 * microtask so ordering/re-entrancy matches async broker delivery.
 */
export function publishMessage(topicName, payload) {
  queueMicrotask(() => {
    messageHandlers.forEach((handler) => {
      try {
        handler(topicName, payload);
      } catch (err) {
        console.warn(`[kiosk] loopback handler error on ${topicName}:`, err.message);
      }
    });
  });
}

export function disconnectBroker() {
  setStatus('disconnected');
}
