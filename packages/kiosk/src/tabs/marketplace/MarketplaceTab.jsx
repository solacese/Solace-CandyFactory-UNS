import { useState } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { MARKETPLACE, WILDCARDS } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';

export default function MarketplaceTab() {
  const publish = usePublish();
  const orders = useSubscription(WILDCARDS.ORDERS);

  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [quantities, setQuantities] = useState(
    Object.fromEntries(SWEETS.map((s) => [s.id, 0]))
  );
  const [submitting, setSubmitting] = useState(false);

  const totalItems = Object.values(quantities).reduce((a, b) => a + b, 0);

  function adjustQty(id, delta) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(10, prev[id] + delta)),
    }));
  }

  function handlePlaceOrder(e) {
    e.preventDefault();
    if (!customerName.trim() || !email.trim() || totalItems === 0) return;

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([sweetType, quantity]) => ({ sweetType, quantity }));

    const correlationId = crypto.randomUUID();
    const envelope = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'marketplace',
      correlationId,
      payload: {
        customerName: customerName.trim(),
        email: email.trim(),
        items,
        status: 'pending',
      },
    };

    setSubmitting(true);
    publish(MARKETPLACE.ORDER_CREATED, envelope);

    setTimeout(() => {
      setCustomerName('');
      setEmail('');
      setQuantities(Object.fromEntries(SWEETS.map((s) => [s.id, 0])));
      setSubmitting(false);
    }, 400);
  }

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">
      {/* LEFT — Order Form */}
      <form onSubmit={handlePlaceOrder} className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white uppercase tracking-wide">Order Entry</h2>
          <span className="text-[10px] font-mono text-white/30">L5 COMMERCE</span>
        </div>

        {/* Customer fields */}
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Customer</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name"
              required
              className="bg-black border border-white/10 text-white font-mono px-3 py-2 text-sm placeholder-white/20 focus:outline-none focus:border-[#00C895]"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              required
              className="bg-black border border-white/10 text-white font-mono px-3 py-2 text-sm placeholder-white/20 focus:outline-none focus:border-[#00C895]"
            />
          </div>
        </div>

        {/* Sweet selection — horizontal row */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono mb-2">Items</label>
          <div className="flex gap-0 border border-white/10 divide-x divide-white/10">
            {SWEETS.map((sweet) => (
              <div key={sweet.id} className="flex-1 flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{sweet.emoji}</span>
                  <span className="text-xs text-white/70 truncate">{sweet.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => adjustQty(sweet.id, -1)}
                    disabled={quantities[sweet.id] === 0}
                    className="w-5 h-5 border border-white/10 text-white/50 flex items-center justify-center text-xs font-bold disabled:opacity-20 hover:border-white/30"
                  >
                    -
                  </button>
                  <span className={`w-5 text-center text-xs font-mono ${quantities[sweet.id] > 0 ? 'text-white' : 'text-white/20'}`}>
                    {quantities[sweet.id]}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustQty(sweet.id, 1)}
                    disabled={quantities[sweet.id] >= 10}
                    className="w-5 h-5 border border-white/10 text-white/50 flex items-center justify-center text-xs font-bold disabled:opacity-20 hover:border-white/30"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || totalItems === 0 || !customerName.trim() || !email.trim()}
          className="w-full py-2.5 font-bold text-sm uppercase tracking-wider bg-[#00C895] text-black disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          {submitting ? 'SENDING...' : `SUBMIT ORDER${totalItems > 0 ? ` (${totalItems})` : ''}`}
        </button>
      </form>

      {/* RIGHT — Recent Orders */}
      <div className="w-[340px] shrink-0 flex flex-col gap-2 border-l border-white/10 pl-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Recent Orders</span>
          <span className="text-[10px] font-mono text-white/20">{orders.length}</span>
        </div>

        {orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/20 text-xs font-mono">
            NO ORDERS
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-0 divide-y divide-white/5">
            {orders.map((order, idx) => (
              <OrderRow key={order.eventId || idx} event={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({ event }) {
  const payload = event.payload || {};
  const items = payload.items || [];
  const sweetMap = Object.fromEntries(SWEETS.map((s) => [s.id, s]));

  return (
    <div className="py-2 flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white font-medium">{payload.customerName || '—'}</span>
        <span className="text-[10px] font-mono border border-white/20 text-white/60 px-1">
          {payload.status?.toUpperCase() || 'PENDING'}
        </span>
      </div>
      <div className="text-[10px] text-white/40 font-mono">
        {items.map((item, i) => {
          const sweet = sweetMap[item.sweetType];
          return (
            <span key={i}>
              {sweet?.emoji} {sweet?.name || item.sweetType} x{item.quantity}
              {i < items.length - 1 && ' | '}
            </span>
          );
        })}
      </div>
      <div className="text-[10px] text-white/20 font-mono">
        {event.correlationId && <span>{event.correlationId.slice(0, 12)}</span>}
        {event.timestamp && <span className="ml-2">{new Date(event.timestamp).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}
