/**
 * Solace broker connection for the Kiosk app.
 * Singleton pattern — all tabs share one WebSocket session.
 */
import solace from 'solclientjs';

// Initialize factory once
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10_5;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

let session = null;
let status = 'disconnected'; // disconnected | connecting | connected | reconnecting
const messageHandlers = [];
const statusHandlers = [];
const subscriptions = new Set(); // topic filters, replayed after reconnect

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
 * Connect to the Solace broker via WebSocket.
 */
export function connectBroker({
  host = import.meta.env.VITE_SOLACE_HOST || 'ws://localhost:8008',
  vpn = import.meta.env.VITE_SOLACE_VPN || 'default',
  username = import.meta.env.VITE_SOLACE_USERNAME || 'haribot',
  password = import.meta.env.VITE_SOLACE_PASSWORD || 'haribot',
} = {}) {
  if (session) return Promise.resolve(session);
  setStatus('connecting');

  return new Promise((resolve, reject) => {
    session = solace.SolclientFactory.createSession({
      url: host,
      vpnName: vpn,
      userName: username,
      password: password,
      connectRetries: 3,
      reconnectRetries: -1,
      reconnectRetryWaitInMsecs: 3000,
    });

    session.on(solace.SessionEventCode.UP_NOTICE, () => {
      console.log('[kiosk] Connected to Solace broker');
      setStatus('connected');
      resolve(session);
    });

    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e) => {
      setStatus('disconnected');
      reject(new Error(`Connection failed: ${e.infoStr}`));
    });

    session.on(solace.SessionEventCode.DISCONNECTED, () => {
      setStatus('disconnected');
    });

    session.on(solace.SessionEventCode.RECONNECTING_NOTICE, () => {
      setStatus('reconnecting');
    });

    session.on(solace.SessionEventCode.RECONNECTED_NOTICE, () => {
      // Subscriptions can be lost across a reconnect — replay them so the
      // feed doesn't silently go dead after a Wi-Fi blip at the booth.
      subscriptions.forEach((filter) => {
        try {
          session.subscribe(
            solace.SolclientFactory.createTopicDestination(filter),
            true,
            filter,
            10000
          );
        } catch (err) {
          console.warn(`[kiosk] Re-subscribe failed for ${filter}:`, err.message);
        }
      });
      setStatus('connected');
    });

    session.on(solace.SessionEventCode.MESSAGE, (message) => {
      const topic = message.getDestination().getName();
      try {
        const raw = message.getBinaryAttachment();
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
        messageHandlers.forEach((handler) => handler(topic, parsed));
      } catch (err) {
        console.warn(`[kiosk] Parse error on ${topic}:`, err.message);
      }
    });

    session.connect();
  });
}

/**
 * Subscribe to a topic wildcard.
 */
export function subscribeTopic(topicFilter) {
  if (!session) throw new Error('Not connected');
  subscriptions.add(topicFilter);
  session.subscribe(
    solace.SolclientFactory.createTopicDestination(topicFilter),
    true,
    topicFilter,
    10000
  );
}

/**
 * Register a message handler.
 * @returns {function} Cleanup function
 */
export function onMessage(handler) {
  messageHandlers.push(handler);
  return () => {
    const idx = messageHandlers.indexOf(handler);
    if (idx >= 0) messageHandlers.splice(idx, 1);
  };
}

/**
 * Publish a JSON payload to a topic.
 */
export function publishMessage(topicName, payload) {
  if (!session) return;
  const message = solace.SolclientFactory.createMessage();
  message.setDestination(solace.SolclientFactory.createTopicDestination(topicName));
  message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
  message.setBinaryAttachment(JSON.stringify(payload));
  session.send(message);
}

/**
 * Disconnect from broker.
 */
export function disconnectBroker() {
  if (session) {
    session.disconnect();
    session.dispose();
    session = null;
    setStatus('disconnected');
  }
}
