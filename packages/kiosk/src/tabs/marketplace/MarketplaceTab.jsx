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

    // Reset form
    setTimeout(() => {
      setCustomerName('');
      setEmail('');
      setQuantities(Object.fromEntries(SWEETS.map((s) => [s.id, 0])));
      setSubmitting(false);
    }, 400);
  }

  return (
    <div className="h-full flex flex-col gap-6 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🛒</span>
        <h2 className="text-xl font-semibold text-white">Marketplace — Order Entry</h2>
        <span className="ml-auto text-xs text-gray-400 font-mono bg-[#0a2e4d] px-2 py-1 rounded">
          Level 5 — Commerce
        </span>
      </div>

      {/* Order Form */}
      <form onSubmit={handlePlaceOrder} className="flex flex-col gap-5">
        {/* Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Customer Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Claire Dupont"
              required
              className="bg-[#0a2e4d] border border-[#1a4a6e] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#00C895] focus:ring-1 focus:ring-[#00C895] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Professional Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. claire@acme-mfg.com"
              required
              className="bg-[#0a2e4d] border border-[#1a4a6e] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#00C895] focus:ring-1 focus:ring-[#00C895] transition-colors"
            />
          </div>
        </div>

        {/* Sweet Selection Grid */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 block">
            Select Sweets
          </label>
          <div className="grid grid-cols-2 gap-3">
            {SWEETS.map((sweet) => (
              <div
                key={sweet.id}
                className="bg-[#0a2e4d] border border-[#1a4a6e] rounded-xl p-4 flex items-center gap-4 hover:border-[#00C895]/40 transition-colors"
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `${sweet.color}20` }}
                >
                  {sweet.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{sweet.name}</div>
                  <div className="text-xs text-gray-500">Bin {sweet.bin}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustQty(sweet.id, -1)}
                    disabled={quantities[sweet.id] === 0}
                    className="w-7 h-7 rounded-md bg-[#03213B] border border-[#1a4a6e] text-white flex items-center justify-center text-lg font-bold disabled:opacity-30 hover:border-[#00C895] transition-colors"
                  >
                    −
                  </button>
                  <span
                    className="w-6 text-center text-sm font-semibold"
                    style={{ color: quantities[sweet.id] > 0 ? sweet.color : '#6b7280' }}
                  >
                    {quantities[sweet.id]}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustQty(sweet.id, 1)}
                    disabled={quantities[sweet.id] >= 10}
                    className="w-7 h-7 rounded-md bg-[#03213B] border border-[#1a4a6e] text-white flex items-center justify-center text-lg font-bold disabled:opacity-30 hover:border-[#00C895] transition-colors"
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
          className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wider bg-[#00C895] text-[#03213B] hover:bg-[#00e6aa] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="animate-spin">⏳</span> Sending...
            </>
          ) : (
            <>
              🚀 Place Order{totalItems > 0 && ` (${totalItems} item${totalItems > 1 ? 's' : ''})`}
            </>
          )}
        </button>
      </form>

      {/* Recent Orders */}
      <div className="flex flex-col gap-3 mt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Recent Orders (UNS)
          </h3>
          <span className="text-xs text-gray-500">
            {orders.length} event{orders.length !== 1 ? 's' : ''}
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No orders yet — place one above or wait for incoming events.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {orders.map((order, idx) => (
              <OrderCard key={order.eventId || idx} event={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ event }) {
  const payload = event.payload || {};
  const items = payload.items || [];
  const sweetMap = Object.fromEntries(SWEETS.map((s) => [s.id, s]));

  return (
    <div className="bg-[#0a2e4d] border border-[#1a4a6e] rounded-lg px-4 py-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-[#6366F1]/20 flex items-center justify-center text-sm shrink-0">
        📦
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white">
            {payload.customerName || 'Unknown'}
          </span>
          <StatusBadge status={payload.status} />
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {items.map((item, i) => {
            const sweet = sweetMap[item.sweetType];
            return (
              <span key={i}>
                {sweet?.emoji || '🍬'} {sweet?.name || item.sweetType} ×{item.quantity}
                {i < items.length - 1 && ' · '}
              </span>
            );
          })}
        </div>
        <div className="text-xs text-gray-600 mt-1 font-mono">
          {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '—'}
          {event.correlationId && (
            <span className="ml-2 text-gray-600">id:{event.correlationId.slice(0, 8)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    validated: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  const cls = styles[status] || styles.pending;

  return (
    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${cls}`}>
      {status || 'pending'}
    </span>
  );
}
