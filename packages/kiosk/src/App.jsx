import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSolaceConnection, useAllEvents } from './broker/useSolace.js';
import { TOPIC_CATEGORIES } from './constants/theme.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import MarketplaceTab from './tabs/marketplace/MarketplaceTab.jsx';
import ErpTab from './tabs/erp/ErpTab.jsx';
import MesTab from './tabs/mes/MesTab.jsx';
import ScadaTab from './tabs/scada/ScadaTab.jsx';
import ArmTab from './tabs/arm/ArmTab.jsx';

const TABS = [
  { key: 'marketplace', label: 'MARKETPLACE', component: MarketplaceTab },
  { key: 'erp', label: 'ERP', component: ErpTab },
  { key: 'mes', label: 'MES', component: MesTab },
  { key: 'scada', label: 'SCADA', component: ScadaTab },
  { key: 'arm', label: 'ARM', component: ArmTab },
];

// UNS topic tree structure
const TOPIC_TREE = {
  'haribot': {
    'paris-demo': {
      'packing': {
        'line1': {
          'orders': null,
          'erp': null,
          'mes': null,
          'scada': null,
          'arm': null,
          'hitl': null,
        }
      }
    }
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const connectionStatus = useSolaceConnection();
  const allEvents = useAllEvents(500);
  const [activeFilters, setActiveFilters] = useState(new Set(TOPIC_CATEGORIES));

  // Simulation engine + presenter controls
  const engineRef = useRef(null);
  const [isOrchestrator, setIsOrchestrator] = useState(false);
  const [autoDemo, setAutoDemo] = useState(true);
  const [feedEpoch, setFeedEpoch] = useState(0); // bump to clear the feed view

  // Start simulation engine once connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const engine = new SimulationEngine();
      engineRef.current = engine;
      engine.onRoleChange((lead) => setIsOrchestrator(lead));
      engine.start();
      return () => {
        engine.stop();
        engineRef.current = null;
      };
    }
  }, [connectionStatus]);

  function handleTriggerOrder() {
    engineRef.current?.triggerOrder();
  }

  function handleToggleAutoDemo() {
    setAutoDemo((prev) => {
      const next = !prev;
      engineRef.current?.setAutoDemo(next);
      return next;
    });
  }

  function handleResetFeed() {
    setFeedEpoch((n) => n + 1);
  }

  // Events shown in the feed, respecting the reset epoch (clears the view
  // without touching the broker or the running cascade).
  const [feedResetAt, setFeedResetAt] = useState(0);
  useEffect(() => {
    setFeedResetAt(allEvents.length ? (allEvents[0]?._receivedAt || Date.now()) : Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedEpoch]);
  const visibleEvents = useMemo(
    () => allEvents.filter((e) => (e._receivedAt || 0) >= feedResetAt),
    [allEvents, feedResetAt]
  );

  // Filter events by active category filters
  const filteredEvents = useMemo(() => {
    if (activeFilters.size === TOPIC_CATEGORIES.length) return visibleEvents;
    return visibleEvents.filter((evt) => {
      const category = getCategoryFromTopic(evt.topic);
      return category && activeFilters.has(category);
    });
  }, [visibleEvents, activeFilters]);

  // Track which categories have recent activity (last 5 seconds)
  const recentActivity = useMemo(() => {
    const now = Date.now();
    const active = new Set();
    for (const evt of visibleEvents.slice(0, 50)) {
      if (now - (evt._receivedAt || 0) < 5000) {
        const cat = getCategoryFromTopic(evt.topic);
        if (cat) active.add(cat);
      }
    }
    return active;
  }, [visibleEvents]);

  function toggleFilter(cat) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.component;

  return (
    <div className="flex flex-col h-screen bg-[#fdf2f8]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#db2777]/28 bg-[#fdf2f8]">
        <div className="flex items-center gap-5">
          <h1 className="t-title font-semibold text-[#2a0f22] tracking-widest font-mono">
            <span className="text-[#db2777]">SOLACE</span> HARIBOT
          </h1>
          <span className="t-label text-[#2a0f22]/55 font-mono tracking-wider">UNS DEMO / ISA-95</span>
        </div>

        {/* Presenter control bar */}
        <div className="flex items-center gap-2">
          <ControlButton onClick={handleTriggerOrder} label="▶ TRIGGER ORDER" />
          <ControlButton
            onClick={handleToggleAutoDemo}
            label={autoDemo ? '⏸ AUTO-DEMO ON' : '▷ AUTO-DEMO OFF'}
            active={autoDemo}
          />
          <ControlButton onClick={handleResetFeed} label="⟳ RESET FEED" />
        </div>

        <div className="flex items-center gap-4">
          <RoleBadge isOrchestrator={isOrchestrator} />
          <span className="t-label font-mono text-[#2a0f22]/55">
            {allEvents.length > 0 && `${allEvents.length} events`}
          </span>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      {/* Body: Split Layout */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Tab Content (70%) */}
        <div className="flex-[7] flex flex-col min-h-0 border-r border-[#db2777]/28">
          {/* Tab Navigation */}
          <nav className="flex border-b border-[#db2777]/28 bg-[#fdf2f8]">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-2.5 t-label font-bold tracking-wider transition-colors relative
                    ${isActive
                      ? 'text-[#2a0f22] bg-[#db2777]/5'
                      : 'text-[#2a0f22]/65 hover:text-[#2a0f22]/88 hover:bg-[#db2777]/[0.02]'
                    }`}
                >
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#db2777]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Tab Content */}
          <main className="flex-1 overflow-hidden">
            <div className="h-full" key={activeTab}>
              {ActiveComponent && <ActiveComponent />}
            </div>
          </main>
        </div>

        {/* RIGHT: Event Feed Panel (30%) */}
        <div className="flex-[3] flex flex-col min-h-0 bg-[#fdf2f8]">
          {/* Panel Header */}
          <div className="px-4 py-2.5 border-b border-[#db2777]/28 flex items-center gap-2">
            <div className="w-2 h-2 bg-[#db2777] animate-live" />
            <span className="t-data font-bold text-[#2a0f22]/88 tracking-widest font-mono">UNS EVENT FEED</span>
            <span className="t-data text-[#2a0f22]/50 font-mono ml-auto">{filteredEvents.length}</span>
          </div>

          {/* Topic Tree */}
          <TopicTree recentActivity={recentActivity} />

          {/* Filter Chips */}
          <div className="px-4 py-2.5 border-b border-[#db2777]/28 flex flex-wrap gap-1.5">
            {TOPIC_CATEGORIES.map((cat) => {
              const isActive = activeFilters.has(cat);
              const hasActivity = recentActivity.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleFilter(cat)}
                  className={`px-2.5 py-1 t-label font-mono font-bold uppercase tracking-wider border transition-colors
                    ${isActive
                      ? 'border-[#db2777]/48 text-[#2a0f22] bg-[#db2777]/5'
                      : 'border-[#db2777]/28 text-[#2a0f22]/50 bg-transparent'
                    }`}
                >
                  {hasActivity && isActive && <span className="inline-block w-1.5 h-1.5 bg-[#db2777] mr-1.5 align-middle" />}
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto px-4 py-1">
            {filteredEvents.length === 0 ? (
              <div className="t-data text-[#2a0f22]/50 font-mono py-4 text-center">
                Waiting for events...
              </div>
            ) : (
              filteredEvents.slice(0, 200).map((evt, i) => (
                <EventRow key={evt.eventId || i} event={evt} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Topic Tree ──────────────────────────────────────────────── */
function TopicTree({ recentActivity }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-b border-[#db2777]/28">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-[#db2777]/[0.02] transition-colors"
      >
        <span className="t-label text-[#2a0f22]/55 font-mono">{collapsed ? '▶' : '▼'}</span>
        <span className="t-label font-mono text-[#2a0f22]/72 tracking-wider">TOPIC HIERARCHY</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-3 font-mono t-label leading-relaxed">
          <div className="text-[#2a0f22]/45">haribot/</div>
          <div className="text-[#2a0f22]/45 pl-2">└─ paris-demo/</div>
          <div className="text-[#2a0f22]/45 pl-5">└─ packing/</div>
          <div className="text-[#2a0f22]/45 pl-8">└─ line1/</div>
          {TOPIC_CATEGORIES.map((cat) => {
            const hasActivity = recentActivity.has(cat);
            return (
              <div key={cat} className="pl-11 flex items-center gap-1">
                <span className="text-[#2a0f22]/45">├─</span>
                <span className={hasActivity ? 'text-[#db2777]' : 'text-[#2a0f22]/55'}>
                  {cat}/
                </span>
                {hasActivity && <span className="w-1 h-1 bg-[#db2777] animate-live" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Event Row ───────────────────────────────────────────────── */
function EventRow({ event }) {
  const shortTopic = event.topic?.replace('haribot/paris-demo/packing/line1/', '') || '';
  const time = event._receivedAt
    ? new Date(event._receivedAt).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  // Compact payload preview
  let preview = '';
  if (event.payload) {
    const p = event.payload;
    if (p.status) preview = p.status;
    else if (p.commandType) preview = p.commandType;
    else if (p.customerName) preview = p.customerName;
    else preview = JSON.stringify(p).slice(0, 40);
  } else if (event.correlationId) {
    preview = event.correlationId.slice(0, 8);
  }

  return (
    <div className="py-1 flex items-start gap-2.5 border-b border-[#db2777]/[0.04] t-data font-mono leading-snug">
      <span className="text-[#2a0f22]/50 shrink-0 w-[62px]">{time}</span>
      <span className="text-[#2a0f22]/88 truncate flex-1">{shortTopic}</span>
      <span className="text-[#2a0f22]/55 truncate max-w-[90px]">{preview}</span>
    </div>
  );
}

/* ─── Presenter Control Button ────────────────────────────────── */
function ControlButton({ onClick, label, active }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 t-label font-mono font-bold tracking-wider border transition-colors
        ${active
          ? 'border-[#db2777]/60 text-[#db2777] bg-[#db2777]/5 hover:bg-[#db2777]/10'
          : 'border-[#db2777]/34 text-[#2a0f22]/82 bg-transparent hover:border-[#db2777]/48 hover:text-[#2a0f22]'
        }`}
    >
      {label}
    </button>
  );
}

/* ─── Orchestrator Role Badge ─────────────────────────────────── */
function RoleBadge({ isOrchestrator }) {
  return (
    <div
      className="flex items-center gap-2"
      title={
        isOrchestrator
          ? 'This screen is driving the simulated cascade'
          : 'Passive viewer — another screen is driving the cascade'
      }
    >
      <div className={`w-1.5 h-1.5 ${isOrchestrator ? 'bg-[#db2777]' : 'bg-[#db2777]/20'}`} />
      <span className="t-label text-[#2a0f22]/65 uppercase font-mono tracking-wider">
        {isOrchestrator ? 'ORCHESTRATOR' : 'VIEWER'}
      </span>
    </div>
  );
}

/* ─── Connection Badge ────────────────────────────────────────── */
function ConnectionBadge({ status }) {
  const isConnected = status === 'connected';
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 ${isConnected ? 'bg-[#db2777] animate-live' : 'bg-[#db2777]/30'}`} />
      <span className="t-label text-[#2a0f22]/65 uppercase font-mono tracking-wider">{status}</span>
    </div>
  );
}

/* ─── Helper ──────────────────────────────────────────────────── */
function getCategoryFromTopic(topic) {
  if (!topic) return null;
  const short = topic.replace('haribot/paris-demo/packing/line1/', '');
  if (short.startsWith('orders/')) return 'orders';
  if (short.startsWith('erp/')) return 'erp';
  if (short.startsWith('mes/')) return 'mes';
  if (short.startsWith('scada/')) return 'scada';
  if (short.startsWith('arm/')) return 'arm';
  if (short.startsWith('hitl/')) return 'hitl';
  return null;
}
