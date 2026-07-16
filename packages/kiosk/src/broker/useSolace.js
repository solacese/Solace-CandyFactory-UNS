import { useState, useEffect, useCallback, useRef } from 'react';
import { connectBroker, subscribeTopic, onMessage, publishMessage, getStatus, onStatusChange } from './connection.js';

/**
 * Hook: manage Solace connection lifecycle.
 */
export function useSolaceConnection() {
  const [status, setStatus] = useState(getStatus());

  useEffect(() => {
    const unsub = onStatusChange(setStatus);
    connectBroker()
      .then(() => subscribeTopic('haribot/>'))
      .catch((err) => console.error('[useSolace]', err.message));
    return unsub;
  }, []);

  return status;
}

/**
 * Hook: subscribe to messages matching a topic prefix.
 * Returns the latest N events matching the pattern.
 */
export function useSubscription(topicPrefix, maxEvents = 50) {
  const [events, setEvents] = useState([]);
  const prefixRef = useRef(topicPrefix);
  prefixRef.current = topicPrefix;

  useEffect(() => {
    const unsub = onMessage((topic, payload) => {
      if (topic.startsWith(prefixRef.current) || prefixRef.current === 'haribot/') {
        setEvents((prev) => {
          const next = [{ topic, ...payload, _receivedAt: Date.now() }, ...prev];
          return next.slice(0, maxEvents);
        });
      }
    });
    return unsub;
  }, [maxEvents]);

  return events;
}

/**
 * Hook: subscribe to ALL events (for the ticker).
 */
export function useAllEvents(maxEvents = 100) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const unsub = onMessage((topic, payload) => {
      setEvents((prev) => {
        const next = [{ topic, ...payload, _receivedAt: Date.now() }, ...prev];
        return next.slice(0, maxEvents);
      });
    });
    return unsub;
  }, [maxEvents]);

  return events;
}

/**
 * Hook: publish events to Solace.
 */
export function usePublish() {
  return useCallback((topic, envelope) => {
    publishMessage(topic, envelope);
  }, []);
}
