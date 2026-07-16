/**
 * Demo Reset Endpoint
 * Resets the demo state: clears order queue, resets inventory, homes arm.
 */
import { publish } from '@haribot/broker-client';
import { TOPICS, createEvent, SOURCES } from '@haribot/common';

export function registerResetRoutes(app, session) {
  // Reset entire demo
  app.post('/api/reset', async (req, res) => {
    console.log('[reset] Resetting demo state...');

    // Publish arm home command
    const homeEvent = createEvent({
      source: SOURCES.UI,
      correlationId: 'demo-reset',
      payload: { commandType: 'home', params: {} },
    });
    publish(session, TOPICS.ARM_COMMAND, homeEvent);

    // Signal reset on a custom topic (dashboard listens for this to clear state)
    const resetEvent = createEvent({
      source: SOURCES.UI,
      correlationId: 'demo-reset',
      payload: { action: 'reset', message: 'Demo state reset' },
    });
    publish(session, 'haribot/paris-demo/packing/line1/system/reset', resetEvent);

    console.log('[reset] Demo reset complete');
    res.json({ status: 'ok', message: 'Demo reset. Inventory will be reset on agent side.' });
  });

  // Trigger a scripted failure (insufficient inventory)
  app.post('/api/trigger-failure', (req, res) => {
    const { scenario = 'insufficient-stock' } = req.body;

    if (scenario === 'insufficient-stock') {
      // Submit an order for a huge quantity that will fail
      const event = createEvent({
        source: SOURCES.UI,
        payload: {
          customerName: 'Failure Test',
          items: [
            { sweetType: 'goldbears', quantity: 999 },
          ],
          status: 'pending',
        },
      });
      publish(session, TOPICS.ORDER_CREATED, event);

      res.json({ status: 'ok', message: 'Failure scenario triggered: insufficient stock order submitted' });
    } else {
      res.status(400).json({ error: `Unknown scenario: ${scenario}` });
    }
  });
}
