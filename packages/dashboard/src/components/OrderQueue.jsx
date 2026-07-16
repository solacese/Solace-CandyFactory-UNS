import React from 'react';

const STATUS_CONFIG = {
  pending: { label: 'PENDING', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  validated: { label: 'VALIDATED', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  rejected: { label: 'REJECTED', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  reserved: { label: 'RESERVED', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  insufficient: { label: 'NO STOCK', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  sequenced: { label: 'SEQUENCED', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  'awaiting-approval': { label: 'AWAITING APPROVAL', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  approved: { label: 'APPROVED', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  complete: { label: 'COMPLETE', color: 'bg-[#00C895]/20 text-[#00C895] border-[#00C895]/30' },
};

export default function OrderQueue({ orders }) {
  const orderList = Object.values(orders).sort((a, b) => {
    // Most recent first
    const aTime = a.steps[a.steps.length - 1]?.timestamp || '';
    const bTime = b.steps[b.steps.length - 1]?.timestamp || '';
    return bTime.localeCompare(aTime);
  });

  if (orderList.length === 0) {
    return (
      <div className="text-center text-white/40 py-12">
        <p className="text-4xl mb-4">📦</p>
        <p>No orders yet</p>
        <p className="text-sm mt-2">Scan the QR code to place an order</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto">
      {orderList.map((order) => {
        const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
        return (
          <div
            key={order.correlationId}
            className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">{order.customerName || 'Unknown'}</h3>
                <p className="text-xs text-white/40 font-mono">{order.correlationId.slice(0, 12)}...</p>
              </div>
              <span className={`px-2 py-1 text-xs font-bold rounded border ${config.color}`}>
                {config.label}
              </span>
            </div>

            {/* Items */}
            {order.items && (
              <div className="flex flex-wrap gap-1">
                {order.items.map((item, i) => (
                  <span key={i} className="text-xs bg-white/10 rounded px-2 py-0.5">
                    {item.sweetType} x{item.quantity}
                  </span>
                ))}
              </div>
            )}

            {/* Rejection reason */}
            {order.rejectReason && (
              <div className="text-xs text-red-400 bg-red-500/10 rounded p-2">
                {order.rejectReason}
              </div>
            )}

            {/* Step timeline */}
            <div className="space-y-1">
              {order.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00C895]"></span>
                  <span className="text-white/60">{new Date(step.timestamp).toLocaleTimeString()}</span>
                  <span className="text-white/80">{step.topic}</span>
                  <span className="text-white/40">({step.source})</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
