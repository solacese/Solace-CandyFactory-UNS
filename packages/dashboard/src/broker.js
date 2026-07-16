/**
 * Browser-side Solace broker connection for the dashboard.
 * Connects via WebSocket and provides pub/sub capabilities.
 */
import solace from 'solclientjs';

// Initialize factory
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10_5;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

let session = null;
const messageHandlers = [];

/**
 * Connect to the broker. Config from env vars injected at build time,
 * or falls back to localhost defaults.
 */
export function connectBroker({
  host = 'ws://localhost:8008',
  vpn = 'default',
  username = 'haribot',
  password = 'haribot',
} = {}) {
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
      console.log('[dashboard] Connected to broker');
      resolve(session);
    });

    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e) => {
      reject(new Error(`Connection failed: ${e.infoStr}`));
    });

    session.on(solace.SessionEventCode.MESSAGE, (message) => {
      const topic = message.getDestination().getName();
      try {
        const raw = message.getBinaryAttachment();
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
        messageHandlers.forEach((handler) => handler(topic, parsed));
      } catch (err) {
        console.warn(`[dashboard] Parse error on ${topic}:`, err.message);
      }
    });

    session.connect();
  });
}

/**
 * Subscribe to a topic filter.
 */
export function subscribeTopic(topicFilter) {
  if (!session) throw new Error('Not connected');
  session.subscribe(
    solace.SolclientFactory.createTopicDestination(topicFilter),
    true,
    topicFilter,
    10000
  );
}

/**
 * Register a message handler.
 * @param {function} handler - Called with (topic, parsedPayload) for every message
 * @returns {function} Unsubscribe function
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
  if (!session) throw new Error('Not connected');
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
  }
}
