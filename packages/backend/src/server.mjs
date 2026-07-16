import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import { connect, publish } from '@haribot/broker-client';
import { TOPICS, createEvent, SOURCES, orderCreatedPayload, SWEET_TYPES, MAX_ORDER_QUANTITY, MAX_ITEMS_PER_ORDER } from '@haribot/common';
import { registerResetRoutes } from './reset.mjs';

const PORT = process.env.BACKEND_PORT || 3001;
const app = express();

app.use(cors());
app.use(express.json());

// Connect to broker on startup
let session;
try {
  session = await connect();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', broker: 'connected' });
});

// Submit order
app.post('/api/orders', (req, res) => {
  const { customerName, email, items } = req.body;

  // Basic validation (more thorough validation happens in Order Agent)
  if (!customerName || typeof customerName !== 'string' || customerName.trim().length === 0) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid professional email is required' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  if (items.length > MAX_ITEMS_PER_ORDER) {
    return res.status(400).json({ error: `Maximum ${MAX_ITEMS_PER_ORDER} different items per order` });
  }

  for (const item of items) {
    if (!SWEET_TYPES.includes(item.sweetType)) {
      return res.status(400).json({ error: `Unknown sweet type: ${item.sweetType}` });
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ORDER_QUANTITY) {
      return res.status(400).json({ error: `Quantity must be 1-${MAX_ORDER_QUANTITY} for ${item.sweetType}` });
    }
  }

  // Create and publish event
  const event = createEvent({
    source: SOURCES.UI,
    payload: orderCreatedPayload({
      customerName: customerName.trim(),
      email: email.trim(),
      items,
    }),
  });

  publish(session, TOPICS.ORDER_CREATED, event);

  console.log(`[order] Published: ${event.correlationId.slice(0, 8)}... for ${customerName}`);

  res.status(201).json({
    orderId: event.eventId,
    correlationId: event.correlationId,
    message: 'Order submitted successfully',
  });
});

// Register demo reset/failure routes
registerResetRoutes(app, session);

app.listen(PORT, () => {
  console.log(`[backend] Listening on http://localhost:${PORT}`);
});
