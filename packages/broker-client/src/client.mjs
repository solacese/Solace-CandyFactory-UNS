import solace from 'solclientjs';
import { loadConfig } from './config.mjs';

// Initialize factory once
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10_5;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

/**
 * Create and connect a Solace session.
 * Returns a Promise that resolves with the connected session.
 *
 * @param {object} [overrides] - Optional config overrides (host, vpn, username, password)
 * @returns {Promise<solace.Session>}
 */
export function connect(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };

  return new Promise((resolve, reject) => {
    const session = solace.SolclientFactory.createSession({
      url: config.host,
      vpnName: config.vpn,
      userName: config.username,
      password: config.password,
      connectRetries: 3,
      reconnectRetries: -1,
      reconnectRetryWaitInMsecs: 3000,
    });

    session.on(solace.SessionEventCode.UP_NOTICE, () => {
      console.log(`[broker] Connected to ${config.host} (VPN: ${config.vpn})`);
      resolve(session);
    });

    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (event) => {
      reject(new Error(`[broker] Connection failed: ${event.infoStr}`));
    });

    session.on(solace.SessionEventCode.DISCONNECTED, () => {
      console.log('[broker] Disconnected');
    });

    session.on(solace.SessionEventCode.RECONNECTING_NOTICE, () => {
      console.log('[broker] Reconnecting...');
    });

    session.on(solace.SessionEventCode.RECONNECTED_NOTICE, () => {
      console.log('[broker] Reconnected');
    });

    try {
      session.connect();
    } catch (err) {
      reject(new Error(`[broker] Connect error: ${err.message}`));
    }
  });
}

/**
 * Publish a JSON event to a topic.
 *
 * @param {solace.Session} session
 * @param {string} topicName - Fully-qualified UNS topic
 * @param {object} event - Event envelope object
 */
export function publish(session, topicName, event) {
  const message = solace.SolclientFactory.createMessage();
  message.setDestination(solace.SolclientFactory.createTopicDestination(topicName));
  message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
  message.setBinaryAttachment(JSON.stringify(event));

  try {
    session.send(message);
  } catch (err) {
    if (err.subcode === solace.ErrorSubcode.INSUFFICIENT_SPACE) {
      console.error('[broker] Transport buffer full, message dropped');
    } else {
      throw err;
    }
  }
}

/**
 * Subscribe to a topic and invoke a callback for each message.
 *
 * @param {solace.Session} session
 * @param {string} topicFilter - Topic or wildcard (e.g., 'haribot/>')
 * @param {function} callback - Called with (topicName, parsedPayload) for each message
 */
export function subscribe(session, topicFilter, callback) {
  session.on(solace.SessionEventCode.MESSAGE, (message) => {
    const receivedTopic = message.getDestination().getName();

    // Only invoke callback if this message matches our subscription
    // (session-level handler fires for ALL subscriptions on this session)
    if (matchesTopic(receivedTopic, topicFilter)) {
      try {
        const raw = message.getBinaryAttachment();
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
        callback(receivedTopic, parsed);
      } catch (err) {
        console.error(`[broker] Failed to parse message on ${receivedTopic}:`, err.message);
      }
    }
  });

  session.subscribe(
    solace.SolclientFactory.createTopicDestination(topicFilter),
    true, // request confirmation
    topicFilter,
    10000
  );

  console.log(`[broker] Subscribed to: ${topicFilter}`);
}

/**
 * Disconnect the session gracefully.
 * @param {solace.Session} session
 */
export function disconnect(session) {
  if (session) {
    session.disconnect();
    session.dispose();
  }
}

/**
 * Simple topic matching supporting Solace '>' (multi-level) and '*' (single-level) wildcards.
 * This is used to filter messages at the client side when a session has multiple subscriptions.
 */
function matchesTopic(actual, filter) {
  // '>' at end matches everything below
  if (filter.endsWith('>')) {
    const prefix = filter.slice(0, -1); // remove '>'
    return actual.startsWith(prefix) || actual === prefix.slice(0, -1);
  }

  const actualParts = actual.split('/');
  const filterParts = filter.split('/');

  if (actualParts.length !== filterParts.length) return false;

  return filterParts.every((part, i) => part === '*' || part === actualParts[i]);
}
