import React, { useState, useEffect } from 'react';
import { useSolaceConnection, useAllEvents } from './broker/useSolace.js';
import { LEVELS, TOPIC_COLORS } from './constants/theme.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import MarketplaceTab from './tabs/marketplace/MarketplaceTab.jsx';
import ErpTab from './tabs/erp/ErpTab.jsx';
import MesTab from './tabs/mes/MesTab.jsx';
import ScadaTab from './tabs/scada/ScadaTab.jsx';
import ArmTab from './tabs/arm/ArmTab.jsx';

const TABS = [
  { key: 'marketplace', level: 5, label: 'Marketplace', component: MarketplaceTab },
  { key: 'erp', level: 4, label: 'ERP', component: ErpTab },
  { key: 'mes', level: 3, label: 'MES', component: MesTab },
  { key: 'scada', level: 2, label: 'SCADA', component: ScadaTab },
  { key: 'arm', level: 1, label: 'Arm Control', component: ArmTab },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const connectionStatus = useSolaceConnection();
  const allEvents = useAllEvents(200);
  const [eventCounts, setEventCounts] = useState({});

  // Start simulation engine once connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const engine = new SimulationEngine();
      engine.start();
      return () => engine.stop();
    }
  }, [connectionStatus]);

  // Track event counts per tab category
  useEffect(() => {
    if (allEvents.length === 0) return;
    const latest = allEvents[0];
    const category = getCategoryFromTopic(latest.topic);
    if (category) {
      setEventCounts((prev) => ({ ...prev, [category]: (prev[category] || 0) + 1 }));
    }
  }, [allEvents.length]);

  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.component;

  return (
    <div className="flex flex-col h-screen bg-solace-dark">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white tracking-wide">
            <span className="text-solace-green">SOLACE</span> HARIBOT
          </h1>
          <span className="text-xs text-white/40 font-mono">ISA-95 UNS DEMO</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-mono text-white/50">
            {allEvents.length > 0 ? `${allEvents.length} events` : ''}
          </div>
          <ConnectionBadge status={connectionStatus} />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex gap-1 px-4 pt-2 border-b border-white/10">
        {TABS.map((tab) => {
          const level = LEVELS[tab.level];
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-white/10 text-white border-b-2'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              style={{ borderBottomColor: isActive ? level.color : 'transparent' }}
            >
              <span className="text-base">{level.icon}</span>
              <span>{tab.label}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: level.color + '30', color: level.color }}
              >
                L{tab.level}
              </span>
              {eventCounts[tab.key] > 0 && !isActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-solace-green animate-pulse-green" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full animate-slide-in" key={activeTab}>
          {ActiveComponent && <ActiveComponent />}
        </div>
      </main>

      {/* Event Ticker */}
      <EventTicker events={allEvents} />
    </div>
  );
}

function ConnectionBadge({ status }) {
  const colors = {
    connected: 'bg-solace-green',
    connecting: 'bg-yellow-400',
    reconnecting: 'bg-yellow-400',
    disconnected: 'bg-red-500',
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-500'} ${status === 'connected' ? 'animate-pulse-green' : ''}`} />
      <span className="text-xs text-white/60 uppercase">{status}</span>
    </div>
  );
}

function EventTicker({ events }) {
  const recent = events.slice(0, 8);
  if (recent.length === 0) return null;

  return (
    <div className="h-7 bg-black/30 border-t border-white/10 flex items-center overflow-hidden px-4">
      <span className="text-[10px] text-solace-green font-bold mr-3 shrink-0">UNS LIVE</span>
      <div className="flex gap-6 overflow-hidden">
        {recent.map((evt, i) => {
          const shortTopic = evt.topic?.replace('haribot/paris-demo/packing/line1/', '') || '';
          const category = shortTopic.split('/')[0];
          const color = TOPIC_COLORS[category] || '#888';
          return (
            <span key={i} className="text-[10px] font-mono text-white/60 whitespace-nowrap shrink-0">
              <span style={{ color }}>{shortTopic}</span>
              <span className="text-white/30 ml-1">
                {evt.correlationId ? evt.correlationId.slice(0, 6) : ''}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function getCategoryFromTopic(topic) {
  if (!topic) return null;
  const short = topic.replace('haribot/paris-demo/packing/line1/', '');
  if (short.startsWith('orders/')) return 'marketplace';
  if (short.startsWith('erp/')) return 'erp';
  if (short.startsWith('mes/')) return 'mes';
  if (short.startsWith('scada/')) return 'scada';
  if (short.startsWith('arm/') || short.startsWith('hitl/')) return 'arm';
  return null;
}
