import React, { useState, useEffect, useMemo } from 'react';
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

  // Start simulation engine once connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const engine = new SimulationEngine();
      engine.start();
      return () => engine.stop();
    }
  }, [connectionStatus]);

  // Filter events by active category filters
  const filteredEvents = useMemo(() => {
    if (activeFilters.size === TOPIC_CATEGORIES.length) return allEvents;
    return allEvents.filter((evt) => {
      const category = getCategoryFromTopic(evt.topic);
      return category && activeFilters.has(category);
    });
  }, [allEvents, activeFilters]);

  // Track which categories have recent activity (last 5 seconds)
  const recentActivity = useMemo(() => {
    const now = Date.now();
    const active = new Set();
    for (const evt of allEvents.slice(0, 50)) {
      if (now - (evt._receivedAt || 0) < 5000) {
        const cat = getCategoryFromTopic(evt.topic);
        if (cat) active.add(cat);
      }
    }
    return active;
  }, [allEvents]);

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
    <div className="flex flex-col h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2 border-b border-white/10 bg-black">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold text-white tracking-widest font-mono">
            <span className="text-[#00C895]">SOLACE</span> HARIBOT
          </h1>
          <span className="text-[10px] text-white/30 font-mono tracking-wider">UNS DEMO / ISA-95</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-white/30">
            {allEvents.length > 0 && `${allEvents.length} events`}
          </span>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      {/* Body: Split Layout */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Tab Content (70%) */}
        <div className="flex-[7] flex flex-col min-h-0 border-r border-white/10">
          {/* Tab Navigation */}
          <nav className="flex border-b border-white/10 bg-[#0a0a0a]">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-2.5 text-xs font-bold tracking-wider transition-colors relative
                    ${isActive
                      ? 'text-white bg-white/5'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.02]'
                    }`}
                >
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00C895]" />
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
        <div className="flex-[3] flex flex-col min-h-0 bg-black">
          {/* Panel Header */}
          <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#00C895] animate-live" />
            <span className="text-[10px] font-bold text-white/60 tracking-widest font-mono">UNS EVENT FEED</span>
            <span className="text-[10px] text-white/20 font-mono ml-auto">{filteredEvents.length}</span>
          </div>

          {/* Topic Tree */}
          <TopicTree recentActivity={recentActivity} />

          {/* Filter Chips */}
          <div className="px-3 py-2 border-b border-white/10 flex flex-wrap gap-1">
            {TOPIC_CATEGORIES.map((cat) => {
              const isActive = activeFilters.has(cat);
              const hasActivity = recentActivity.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleFilter(cat)}
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider border transition-colors
                    ${isActive
                      ? 'border-white/30 text-white bg-white/5'
                      : 'border-white/10 text-white/20 bg-transparent'
                    }`}
                >
                  {hasActivity && isActive && <span className="inline-block w-1 h-1 bg-[#00C895] mr-1 align-middle" />}
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto px-3 py-1">
            {filteredEvents.length === 0 ? (
              <div className="text-[10px] text-white/20 font-mono py-4 text-center">
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
    <div className="border-b border-white/10">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[9px] text-white/30 font-mono">{collapsed ? '▶' : '▼'}</span>
        <span className="text-[9px] font-mono text-white/40 tracking-wider">TOPIC HIERARCHY</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 font-mono text-[9px] leading-relaxed">
          <div className="text-white/20">haribot/</div>
          <div className="text-white/20 pl-2">└─ paris-demo/</div>
          <div className="text-white/20 pl-5">└─ packing/</div>
          <div className="text-white/20 pl-8">└─ line1/</div>
          {TOPIC_CATEGORIES.map((cat) => {
            const hasActivity = recentActivity.has(cat);
            return (
              <div key={cat} className="pl-11 flex items-center gap-1">
                <span className="text-white/20">├─</span>
                <span className={hasActivity ? 'text-[#00C895]' : 'text-white/30'}>
                  {cat}/
                </span>
                {hasActivity && <span className="w-1 h-1 bg-[#00C895] animate-live" />}
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
    <div className="py-[3px] flex items-start gap-2 border-b border-white/[0.03] text-[10px] font-mono">
      <span className="text-white/20 shrink-0 w-14">{time}</span>
      <span className="text-white/60 truncate flex-1">{shortTopic}</span>
      <span className="text-white/25 truncate max-w-[80px]">{preview}</span>
    </div>
  );
}

/* ─── Connection Badge ────────────────────────────────────────── */
function ConnectionBadge({ status }) {
  const isConnected = status === 'connected';
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 ${isConnected ? 'bg-[#00C895] animate-live' : 'bg-white/30'}`} />
      <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">{status}</span>
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
