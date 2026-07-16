import React, { useState, useEffect, useCallback, useRef } from 'react';
import { connectBroker, subscribeTopic, onMessage, publishMessage } from './broker.js';
import EventFeed from './components/EventFeed.jsx';
import OrderQueue from './components/OrderQueue.jsx';
import ArmPanel from './components/ArmPanel.jsx';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [orders, setOrders] = useState({});
  const [armStatus, setArmStatus] = useState({ status: 'idle', jointAngles: [0,0,0,0,0,0], gripperState: 'open' });
  const [hitlPending, setHitlPending] = useState(null);
  const [activeTab, setActiveTab] = useState('feed');

  useEffect(() => {
    connectBroker()
      .then(() => {
        setConnected(true);
        subscribeTopic('haribot/>');
      })
      .catch((err) => console.error('Broker connect failed:', err));
  }, []);

  useEffect(() => {
    if (!connected) return;

    const unsub = onMessage((topic, event) => {
      // Add to event feed
      setEvents((prev) => [{ topic, ...event, _receivedAt: Date.now() }, ...prev].slice(0, 500));

      const { correlationId, payload, source } = event;
      if (!correlationId || !payload) return;

      // Track order lifecycle
      const topicSuffix = topic.replace('haribot/paris-demo/packing/line1/', '');

      setOrders((prev) => {
        const existing = prev[correlationId] || { correlationId, steps: [], status: 'pending', customerName: '' };
        const updated = { ...existing };

        if (topicSuffix === 'orders/created') {
          updated.customerName = payload.customerName || '';
          updated.items = payload.items || [];
          updated.status = 'pending';
        } else if (topicSuffix === 'orders/validated') {
          updated.status = 'validated';
        } else if (topicSuffix === 'orders/rejected') {
          updated.status = 'rejected';
          updated.rejectReason = payload.reason;
        } else if (topicSuffix === 'inventory/reserved') {
          updated.status = 'reserved';
        } else if (topicSuffix === 'inventory/insufficient') {
          updated.status = 'insufficient';
          updated.rejectReason = payload.reason;
        } else if (topicSuffix === 'pack-job/sequenced') {
          updated.status = 'sequenced';
          updated.sequence = payload.sequence;
        } else if (topicSuffix === 'pack-job/status') {
          updated.packStatus = payload.status;
          if (payload.status === 'complete') updated.status = 'complete';
        } else if (topicSuffix === 'hitl/approval-required') {
          updated.status = 'awaiting-approval';
        } else if (topicSuffix === 'hitl/approved') {
          updated.status = 'approved';
        }

        updated.steps = [...existing.steps, { topic: topicSuffix, timestamp: event.timestamp, source }];
        return { ...prev, [correlationId]: updated };
      });

      // Track arm state
      if (topicSuffix === 'arm/telemetry') {
        setArmStatus((prev) => ({ ...prev, jointAngles: payload.jointAngles, gripperState: payload.gripperState }));
      } else if (topicSuffix === 'arm/status') {
        setArmStatus((prev) => ({ ...prev, status: payload.status }));
      } else if (topicSuffix === 'hitl/approval-required') {
        setHitlPending({ correlationId, ...payload });
      } else if (topicSuffix === 'hitl/approved') {
        setHitlPending(null);
      }
    });

    return unsub;
  }, [connected]);

  const handleApproveHitl = useCallback(() => {
    if (!hitlPending) return;
    const event = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'ui',
      correlationId: hitlPending.correlationId,
      payload: { approvedBy: 'operator', status: 'approved' },
    };
    publishMessage('haribot/paris-demo/packing/line1/hitl/approved', event);
  }, [hitlPending]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#03213B] border-b border-[#00C895]/30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#00C895] animate-pulse"></div>
          <h1 className="text-lg font-bold tracking-wide">HARIBOT COMMAND CENTER</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={`px-2 py-1 rounded text-xs font-bold ${connected ? 'bg-[#00C895]/20 text-[#00C895]' : 'bg-red-500/20 text-red-400'}`}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-[#03213B] border-b border-[#00C895]/20 px-6 flex gap-1">
        {[
          { id: 'feed', label: 'UNS EVENT FEED' },
          { id: 'orders', label: 'ORDER QUEUE' },
          { id: 'arm', label: 'ARM CONTROL' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#00C895] text-[#00C895]'
                : 'border-transparent text-white/60 hover:text-white/80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* HITL Banner */}
      {hitlPending && (
        <div className="bg-purple-900/50 border-b border-purple-500 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-purple-200">HUMAN APPROVAL REQUIRED</p>
              <p className="text-sm text-purple-300">
                Arm motion planned for order {hitlPending.correlationId.slice(0, 8)}...
              </p>
            </div>
          </div>
          <button
            onClick={handleApproveHitl}
            className="bg-[#00C895] hover:bg-[#00C895]/80 text-[#03213B] font-bold px-6 py-2 rounded-lg transition-colors"
          >
            APPROVE MOTION
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden">
        {activeTab === 'feed' && <EventFeed events={events} />}
        {activeTab === 'orders' && <OrderQueue orders={orders} />}
        {activeTab === 'arm' && <ArmPanel armStatus={armStatus} hitlPending={hitlPending} onApprove={handleApproveHitl} />}
      </main>
    </div>
  );
}
