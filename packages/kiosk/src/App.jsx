import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSolaceConnection, useAllEvents } from './broker/useSolace.js';
import { TOPIC_CATEGORIES, TOPIC_COLORS } from './constants/theme.js';
import { shortTopic as stripPrefix } from './constants/topics.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import MarketplaceTab from './tabs/marketplace/MarketplaceTab.jsx';
import ErpTab from './tabs/erp/ErpTab.jsx';
import MesTab from './tabs/mes/MesTab.jsx';
import ScadaTab from './tabs/scada/ScadaTab.jsx';
import ArmTab from './tabs/arm/ArmTab.jsx';
import SamTab from './tabs/sam/SamTab.jsx';

const TABS = [
  { key: 'marketplace', label: 'MARKETPLACE', component: MarketplaceTab },
  { key: 'erp', label: 'ERP', component: ErpTab },
  { key: 'mes', label: 'MES', component: MesTab },
  { key: 'scada', label: 'SCADA', component: ScadaTab },
  { key: 'arm', label: 'ARM', component: ArmTab },
  { key: 'sam', label: 'SAM', component: SamTab, accent: '#7c3aed' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const connectionStatus = useSolaceConnection();
  const allEvents = useAllEvents(1000);
  const [activeFilters, setActiveFilters] = useState(new Set(TOPIC_CATEGORIES));
  // Broker-style topic subscription typed into the feed header (e.g. "scada/sensor",
  // "arm/>", "paris/*/scada/*"). Empty = subscribe to everything.
  const [topicFilter, setTopicFilter] = useState('');

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

  // Chaos button: 5s cooldown surfaced as a live countdown so the presenter
  // can see when it re-arms. Auto-jumps to the SAM tab so the resolution is
  // visible the moment a disruption is injected.
  const [chaosCooldown, setChaosCooldown] = useState(0); // seconds remaining
  useEffect(() => {
    if (chaosCooldown <= 0) return;
    const id = setInterval(() => {
      const left = Math.ceil((engineRef.current?.chaosCooldownRemaining() ?? 0) / 1000);
      setChaosCooldown(left);
      if (left <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [chaosCooldown]);

  function handleTriggerOrder() {
    engineRef.current?.triggerOrder();
  }

  function handleTriggerChaos() {
    const fired = engineRef.current?.triggerChaos();
    if (fired) {
      setActiveTab('sam');
      setChaosCooldown(Math.ceil((engineRef.current?.chaosCooldownRemaining() ?? 5000) / 1000));
    }
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

  // Filter events by the typed topic subscription first, then category chips.
  // When a topic filter is active it is authoritative — the operator asked to
  // see exactly that subscription, so category chips and the chaos-always-on
  // rule don't override it.
  const filteredEvents = useMemo(() => {
    const hasTopic = topicFilter.trim().length > 0;
    if (hasTopic) {
      return visibleEvents.filter((evt) => topicMatches(evt.topic, topicFilter));
    }
    if (activeFilters.size === TOPIC_CATEGORIES.length) return visibleEvents;
    return visibleEvents.filter((evt) => {
      const category = getCategoryFromTopic(evt.topic);
      // Injected disruptions always stay visible so a fault is never hidden
      // by an active filter — they're the whole point of the chaos demo.
      if (category === 'chaos' || evt.payload?.chaos === true) return true;
      return category && activeFilters.has(category);
    });
  }, [visibleEvents, activeFilters, topicFilter]);

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

  // Per-category live throughput in events/second, measured over a short 5s
  // window so it stays responsive under a deluge. Recomputed on a 1s tick so
  // the numbers keep advancing (and decay) even when no new event arrives.
  const RATE_WINDOW_MS = 5000;
  const [statTick, setStatTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStatTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const categoryStats = useMemo(() => {
    const now = Date.now();
    const stats = {}; // cat -> { rate }
    const perCat = {};
    for (const evt of allEvents) {
      const cat = getCategoryFromTopic(evt.topic);
      if (!cat) continue;
      const age = now - (evt._receivedAt || 0);
      if (age > RATE_WINDOW_MS) continue;
      perCat[cat] = (perCat[cat] || 0) + 1;
    }
    let totalRate = 0;
    for (const [cat, count] of Object.entries(perCat)) {
      const rate = count / (RATE_WINDOW_MS / 1000);
      stats[cat] = { rate };
      totalRate += rate;
    }
    stats.__total = { rate: totalRate };
    return stats;
    // statTick drives the recompute cadence
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, statTick]);

  // Rate of what's actually shown in the feed (respects the topic filter),
  // so the header number matches the stream the operator subscribed to.
  const feedRate = useMemo(() => {
    const now = Date.now();
    const count = filteredEvents.reduce(
      (n, e) => (now - (e._receivedAt || 0) <= RATE_WINDOW_MS ? n + 1 : n),
      0
    );
    return count / (RATE_WINDOW_MS / 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents, statTick]);

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
    <div className="flex flex-col h-screen bg-[#ecfdf5]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#00c895]/28 bg-[#ecfdf5]">
        <h1 className="text-lg font-extrabold text-[#052e22] tracking-[0.18em] font-mono">
          <span className="text-[#00c895]">SOLACE</span> CANDYFACTORY
        </h1>

        {/* Presenter control bar */}
        <div className="flex items-center gap-2">
          <ControlButton onClick={handleTriggerOrder} label="▶ Trigger random order" />
          <ChaosButton onClick={handleTriggerChaos} cooldown={chaosCooldown} />
          <ControlButton
            onClick={handleToggleAutoDemo}
            label={autoDemo ? '⏸ Auto-demo on' : '▷ Auto-demo off'}
            active={autoDemo}
          />
          <a
            href={`${import.meta.env.BASE_URL}uns.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 t-label font-mono font-bold tracking-wider border transition-colors
              border-[#00c895]/34 text-[#052e22]/82 bg-transparent hover:border-[#00c895]/48 hover:text-[#052e22]"
          >
            ⓘ What is UNS?
          </a>
        </div>
      </header>

      {/* Body: Split Layout */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Tab Content (70%) */}
        <div className="flex-[7] flex flex-col min-h-0 border-r border-[#00c895]/28">
          {/* Tab Navigation */}
          <nav className="flex border-b border-[#00c895]/28 bg-[#ecfdf5]">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const accent = tab.accent || '#00c895';
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-2.5 t-label font-bold tracking-wider transition-colors relative
                    ${isActive
                      ? 'text-[#052e22]'
                      : 'text-[#052e22]/65 hover:text-[#052e22]/88 hover:bg-[#00c895]/[0.02]'
                    }`}
                  style={isActive ? { background: `${accent}0d` } : undefined}
                >
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
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
        <div className="flex-[3] flex flex-col min-h-0 bg-[#ecfdf5]">
          {/* Panel Header */}
          <div className="px-4 py-2.5 border-b border-[#00c895]/28 flex items-center gap-2">
            <div className="w-2 h-2 bg-[#00c895] animate-live" />
            <span className="t-data font-bold text-[#052e22]/88 tracking-widest font-mono">UNS EVENT FEED</span>
            <span className="t-label text-[#052e22]/55 font-mono ml-auto tabular-nums">
              {feedRate.toFixed(1)}/s
            </span>
          </div>

          {/* Subscribe box — type a topic subscription (broker-style wildcards) */}
          <SubscribeBar value={topicFilter} onChange={setTopicFilter} matchCount={filteredEvents.length} />

          {/* Topic Tree */}
          <TopicTree recentActivity={recentActivity} stats={categoryStats} />

          {/* Filter Chips */}
          <div className="px-4 py-2.5 border-b border-[#00c895]/28 flex flex-wrap gap-1.5">
            {TOPIC_CATEGORIES.map((cat) => {
              const isActive = activeFilters.has(cat);
              const hasActivity = recentActivity.has(cat);
              const color = TOPIC_COLORS[cat] || '#00c895';
              return (
                <button
                  key={cat}
                  onClick={() => toggleFilter(cat)}
                  className="px-2.5 py-1 t-label font-mono font-bold uppercase tracking-wider border transition-colors"
                  style={isActive
                    ? { borderColor: `${color}7a`, color: '#052e22', background: `${color}0d` }
                    : { borderColor: 'rgba(6,120,90,0.28)', color: 'rgba(5,46,34,0.5)', background: 'transparent' }}
                >
                  {hasActivity && isActive && <span className="inline-block w-1.5 h-1.5 mr-1.5 align-middle" style={{ background: color }} />}
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto px-4 py-1">
            {filteredEvents.length === 0 ? (
              <div className="t-data text-[#052e22]/50 font-mono py-4 text-center">
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

/* ─── Subscribe Bar ───────────────────────────────────────────── */
// Type a topic subscription like a real broker client. Supports * (one level)
// and > (rest of topic). Quick-picks make the common ones one tap.
const QUICK_SUBS = [
  { label: 'all', value: '' },
  { label: 'scada/sensor/*', value: 'scada/sensor/*' },
  { label: 'arm/>', value: 'arm/>' },
  { label: 'mes/>', value: 'mes/>' },
  { label: 'erp/>', value: 'erp/>' },
  { label: 'sam/>', value: 'sam/>' },
];

function SubscribeBar({ value, onChange, matchCount }) {
  const active = value.trim().length > 0;
  return (
    <div className="px-4 py-2 border-b border-[#00c895]/28 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="t-label font-mono font-bold tracking-widest text-[#00c895]">SUB</span>
        <div className="flex-1 flex items-center border transition-colors"
          style={{ borderColor: active ? '#00c895' : 'rgba(6,120,90,0.28)' }}>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="subscribe to a topic…  e.g. scada/sensor/*  ·  arm/>"
            spellCheck={false}
            className="flex-1 bg-white text-[#052e22] font-mono t-label px-2 py-1.5 placeholder-[#052e22]/40 focus:outline-none"
          />
          {active && (
            <button
              onClick={() => onChange('')}
              title="Clear subscription"
              className="px-2 text-[#052e22]/50 hover:text-[#ef4444] t-label font-mono"
            >
              ✕
            </button>
          )}
        </div>
        {active && (
          <span className="t-label font-mono text-[#052e22]/55 tabular-nums shrink-0">{matchCount} match</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SUBS.map((q) => {
          const isOn = value.trim() === q.value.trim();
          return (
            <button
              key={q.label}
              onClick={() => onChange(q.value)}
              className="px-2 py-0.5 t-label font-mono border transition-colors"
              style={isOn
                ? { borderColor: '#00c895', color: '#052e22', background: 'rgba(0,200,149,0.08)' }
                : { borderColor: 'rgba(6,120,90,0.24)', color: 'rgba(5,46,34,0.55)', background: 'transparent' }}
            >
              {q.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Topic Tree ──────────────────────────────────────────────── */
function TopicTree({ recentActivity, stats = {} }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-b border-[#00c895]/28">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-[#00c895]/[0.02] transition-colors"
      >
        <span className="t-label text-[#052e22]/55 font-mono">{collapsed ? '▶' : '▼'}</span>
        <span className="t-label font-mono text-[#052e22]/72 tracking-wider">TOPIC HIERARCHY</span>
        <span className="t-label font-mono text-[#052e22]/35 tracking-wider ml-auto pr-1">evt/s</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-3 font-mono t-label leading-relaxed">
          <div className="text-[#052e22]/45">candyfactory/</div>

          {/* Enterprise — company-wide business systems (L5, L4) + SAM */}
          <div className="text-[#052e22]/45 pl-2">├─ enterprise/</div>
          {['orders', 'erp', 'sam'].map((cat) => (
            <TreeLeaf key={cat} cat={cat} indent="pl-5" active={recentActivity.has(cat)} stat={stats[cat]} />
          ))}

          {/* Site — Paris manufacturing site */}
          <div className="text-[#052e22]/45 pl-2">└─ paris/</div>
          {/* MES lives at the site level (L3) */}
          <TreeLeaf cat="mes" indent="pl-5" active={recentActivity.has('mes')} stat={stats.mes} />

          {/* Area / production line — shop-floor equipment (L2, L0-1) */}
          <div className="text-[#052e22]/45 pl-5">└─ packing/line1/</div>
          {['scada', 'arm', 'hitl'].map((cat) => (
            <TreeLeaf key={cat} cat={cat} indent="pl-8" active={recentActivity.has(cat)} stat={stats[cat]} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Topic tree leaf (one UNS category under its location) ────── */
function TreeLeaf({ cat, indent, active, stat }) {
  const rate = stat?.rate ?? 0;
  const color = TOPIC_COLORS[cat] || '#00c895';
  return (
    <div className={`${indent} flex items-center gap-1`}>
      <span className="text-[#052e22]/45">├─</span>
      <span style={active ? { color } : undefined} className={active ? '' : 'text-[#052e22]/55'}>{cat}/</span>
      {active && <span className="w-1 h-1 animate-live" style={{ background: color }} />}
      <span className="ml-auto tabular-nums">
        <span style={rate > 0 ? { color } : undefined} className={rate > 0 ? '' : 'text-[#052e22]/30'}>{rate.toFixed(1)}/s</span>
      </span>
    </div>
  );
}

/* ─── Event Row ───────────────────────────────────────────────── */
function EventRow({ event }) {
  const shortTopic = stripPrefix(event.topic || '');
  const time = event._receivedAt
    ? new Date(event._receivedAt).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  const p = event.payload || {};
  // Chaos = a deliberately injected fault. samFix / recovered = SAM's answer.
  const isChaos = p.chaos === true;
  const isSamFix = p.samFix === true || p.recovered === true;
  const cat = getCategoryFromTopic(event.topic);
  const catColor = TOPIC_COLORS[cat];

  // Compact payload preview
  let preview = '';
  if (event.payload) {
    if (p.error) preview = p.error;
    else if (p.status) preview = p.status;
    else if (p.commandType) preview = p.commandType;
    else if (p.reasoning) preview = 'reasoning';
    else if (p.action) preview = p.action;
    else if (p.customerName) preview = p.customerName;
    else if (p.customer?.name) preview = p.customer.name;
    else preview = JSON.stringify(p).slice(0, 40);
  } else if (event.correlationId) {
    preview = event.correlationId.slice(0, 8);
  }

  const rowClass = isChaos
    ? 'py-1 flex items-start gap-2.5 border-b border-[#ef4444]/15 bg-[#ef4444]/[0.06] t-data font-mono leading-snug'
    : 'py-1 flex items-start gap-2.5 border-b border-[#00c895]/[0.04] t-data font-mono leading-snug';

  return (
    <div className={rowClass}>
      <span className="text-[#052e22]/50 shrink-0 w-[62px]">{time}</span>
      {isChaos && <span className="text-[#ef4444] shrink-0" title="Injected disruption">⚠</span>}
      {isSamFix && <span className="text-[#7c3aed] shrink-0" title="SAM corrective action">✓</span>}
      <span
        className="truncate flex-1"
        style={isChaos ? { color: '#ef4444', fontWeight: 500 } : catColor ? { color: catColor } : { color: 'rgba(5,46,34,0.88)' }}
      >
        {shortTopic}
      </span>
      <span className={`truncate max-w-[90px] ${isChaos ? 'text-[#ef4444]/80' : 'text-[#052e22]/55'}`}>{preview}</span>
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
          ? 'border-[#00c895]/60 text-[#00c895] bg-[#00c895]/5 hover:bg-[#00c895]/10'
          : 'border-[#00c895]/34 text-[#052e22]/82 bg-transparent hover:border-[#00c895]/48 hover:text-[#052e22]'
        }`}
    >
      {label}
    </button>
  );
}

/* ─── Chaos Button (red, 5s cooldown) ─────────────────────────── */
function ChaosButton({ onClick, cooldown }) {
  const cooling = cooldown > 0;
  return (
    <button
      onClick={onClick}
      disabled={cooling}
      title={cooling ? `Re-arms in ${cooldown}s` : 'Inject a disruption for SAM to solve'}
      className={`px-3 py-1.5 t-label font-mono font-bold tracking-wider border transition-colors tabular-nums
        ${cooling
          ? 'border-[#ef4444]/25 text-[#ef4444]/50 bg-transparent cursor-not-allowed'
          : 'border-[#ef4444]/55 text-[#ef4444] bg-[#ef4444]/5 hover:bg-[#ef4444]/10 hover:border-[#ef4444]'
        }`}
    >
      {cooling ? `⚡ Chaos (${cooldown}s)` : '⚡ Trigger chaos'}
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
      <div className={`w-1.5 h-1.5 ${isOrchestrator ? 'bg-[#00c895]' : 'bg-[#00c895]/20'}`} />
      <span className="t-label text-[#052e22]/65 uppercase font-mono tracking-wider">
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
      <div className={`w-2 h-2 ${isConnected ? 'bg-[#00c895] animate-live' : 'bg-[#00c895]/30'}`} />
      <span className="t-label text-[#052e22]/65 uppercase font-mono tracking-wider">{status}</span>
    </div>
  );
}

/* ─── Topic subscription matcher (broker-style wildcards) ─────── */
// Supports Solace/MQTT-style wildcards against the FULL topic:
//   *  matches exactly one level (segment between slashes)
//   >  matches one or more trailing levels (only meaningful at the end)
// A bare substring with no wildcard is treated as "match if the topic
// contains it", so typing "scada/sensor" just works. Matching ignores the
// leading root, so you can type either "candyfactory/paris/…/scada/…" or the
// short "scada/…" form shown in the feed.
function topicMatches(fullTopic, filter) {
  const f = (filter || '').trim();
  if (!f) return true;
  const topic = fullTopic || '';
  const short = stripPrefix(topic);

  // No wildcard → forgiving substring match on either the full or short form.
  if (!f.includes('*') && !f.includes('>')) {
    return topic.includes(f) || short.includes(f);
  }

  const rx = wildcardToRegex(f);
  return rx.test(topic) || rx.test(short);
}

function wildcardToRegex(filter) {
  // Escape regex specials except our wildcards, then translate:
  //   *  → one level  ([^/]+)
  //   >  → rest of topic  (.+)
  const esc = filter.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = esc
    .replace(/\*/g, '[^/]+')
    .replace(/>/g, '.+');
  return new RegExp(`(^|/)${body}$`);
}

/* ─── Helper ──────────────────────────────────────────────────── */
function getCategoryFromTopic(topic) {
  if (!topic) return null;
  const short = stripPrefix(topic);
  if (short.startsWith('orders/')) return 'orders';
  if (short.startsWith('erp/')) return 'erp';
  if (short.startsWith('mes/')) return 'mes';
  if (short.startsWith('scada/')) return 'scada';
  if (short.startsWith('arm/')) return 'arm';
  if (short.startsWith('hitl/')) return 'hitl';
  if (short.startsWith('sam/')) return 'sam';
  if (short.startsWith('chaos/')) return 'chaos';
  return null;
}
