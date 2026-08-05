import { useState, useEffect, useCallback, useRef } from 'react';
import { connectBroker, subscribeTopic, onMessage, publishMessage, getStatus, onStatusChange } from './connection.js';
import { WILDCARDS, PREFIXES } from '../constants/topics.js';

// Root wildcard subscription + the bare root prefix, so the UNS topic root is
// defined in exactly one place (constants/topics.js) and never drifts.
const ROOT_WILDCARD = WILDCARDS.ALL;          // e.g. "candyfactory/>"
const ROOT_PREFIX = `${PREFIXES.ROOT}/`;      // e.g. "candyfactory/"

/**
 * Hook: manage Solace connection lifecycle.
 */
export function useSolaceConnection() {
  const [status, setStatus] = useState(getStatus());

  useEffect(() => {
    const unsub = onStatusChange(setStatus);
    connectBroker()
      .then(() => subscribeTopic(ROOT_WILDCARD))
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
      if (topic.startsWith(prefixRef.current) || prefixRef.current === ROOT_PREFIX) {
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
      // Hide internal orchestration topics (e.g. leader-election heartbeats)
      // from the customer-facing UNS feed — they aren't part of the story.
      if (topic.includes('/_sim/')) return;
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
