import { useState, useMemo } from 'react';
import { useSubscription } from '../../broker/useSolace.js';
import { WILDCARDS } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';

const STATUS_CONFIG = {
  created: { label: 'Created', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', barColor: '#3B82F6' },
  scheduled: { label: 'Scheduled', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', barColor: '#8B5CF6' },
  released: { label: 'Released', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', barColor: '#F59E0B' },
  'in-progress': { label: 'In Progress', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', barColor: '#EAB308' },
  completed: { label: 'Completed', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', barColor: '#22C55E' },
};

const PRIORITY_CONFIG = {
  high: { label: 'High', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  medium: { label: 'Med', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  low: { label: 'Low', bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export default function ErpTab() {
  const erpEvents = useSubscription(WILDCARDS.ERP);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'schedule'

  // Aggregate work orders from events — latest status wins
  const workOrders = useMemo(() => {
    const woMap = new Map();

    // Process events newest-first, building up WO state
    for (const event of erpEvents) {
      const payload = event.payload || {};
      const id = payload.workOrderId;
      if (!id) continue;

      if (!woMap.has(id)) {
        woMap.set(id, {
          workOrderId: id,
          customerName: payload.customerName || '—',
          priority: payload.priority || 'medium',
          items: payload.items || [],
          status: payload.status || extractStatusFromTopic(event.topic),
          scheduledStart: payload.scheduledStart || null,
          scheduledEnd: payload.scheduledEnd || null,
          createdAt: payload.createdAt || event.timestamp,
        });
      } else {
        // Update status if this event carries a later status
        const existing = woMap.get(id);
        const eventStatus = payload.status || extractStatusFromTopic(event.topic);
        if (statusRank(eventStatus) > statusRank(existing.status)) {
          existing.status = eventStatus;
        }
        // Merge schedule info
        if (payload.scheduledStart) existing.scheduledStart = payload.scheduledStart;
        if (payload.scheduledEnd) existing.scheduledEnd = payload.scheduledEnd;
      }
    }

    return [...woMap.values()].sort((a, b) => {
      // Sort by creation time descending
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [erpEvents]);

  // KPIs
  const kpis = useMemo(() => {
    const open = workOrders.filter((wo) => ['created', 'scheduled', 'released'].includes(wo.status)).length;
    const inProgress = workOrders.filter((wo) => wo.status === 'in-progress').length;
    const completed = workOrders.filter((wo) => wo.status === 'completed').length;

    // Average cycle time: completed WOs with both start and end
    const completedWithTime = workOrders.filter(
      (wo) => wo.status === 'completed' && wo.scheduledStart && wo.scheduledEnd
    );
    let avgCycle = '—';
    if (completedWithTime.length > 0) {
      const totalMs = completedWithTime.reduce((sum, wo) => {
        return sum + (new Date(wo.scheduledEnd).getTime() - new Date(wo.scheduledStart).getTime());
      }, 0);
      const avgMin = Math.round(totalMs / completedWithTime.length / 60000);
      avgCycle = `${avgMin}m`;
    }

    return { open, inProgress, completed, avgCycle };
  }, [workOrders]);

  return (
    <div className="h-full flex flex-col gap-5 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">📊</span>
        <h2 className="text-xl font-semibold text-white">ERP — Work Order Management</h2>
        <span className="ml-auto text-xs text-gray-400 font-mono bg-[#0a2e4d] px-2 py-1 rounded">
          Level 4 — Business Planning
        </span>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Open WOs" value={kpis.open} color="#3B82F6" />
        <KpiCard label="In Progress" value={kpis.inProgress} color="#EAB308" />
        <KpiCard label="Completed Today" value={kpis.completed} color="#22C55E" />
        <KpiCard label="Avg Cycle Time" value={kpis.avgCycle} color="#8B5CF6" />
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('table')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === 'table'
              ? 'bg-[#00C895]/20 text-[#00C895] border border-[#00C895]/40'
              : 'bg-[#0a2e4d] text-gray-400 border border-[#1a4a6e] hover:text-white'
          }`}
        >
          📋 Table View
        </button>
        <button
          onClick={() => setViewMode('schedule')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === 'schedule'
              ? 'bg-[#00C895]/20 text-[#00C895] border border-[#00C895]/40'
              : 'bg-[#0a2e4d] text-gray-400 border border-[#1a4a6e] hover:text-white'
          }`}
        >
          📅 Schedule View
        </button>
        <span className="ml-auto text-xs text-gray-500">
          {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''} · {erpEvents.length} events
        </span>
      </div>

      {/* Content */}
      {workOrders.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm">No work orders yet.</div>
            <div className="text-xs mt-1">Orders from the marketplace will generate work orders here.</div>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <WorkOrderTable workOrders={workOrders} />
      ) : (
        <ScheduleView workOrders={workOrders} />
      )}
    </div>
  );
}

/* ─── KPI Card ────────────────────────────────────────────────── */
function KpiCard({ label, value, color }) {
  return (
    <div className="bg-[#0a2e4d] border border-[#1a4a6e] rounded-xl p-4 flex flex-col gap-1">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Work Order Table ────────────────────────────────────────── */
function WorkOrderTable({ workOrders }) {
  const sweetMap = Object.fromEntries(SWEETS.map((s) => [s.id, s]));

  return (
    <div className="overflow-x-auto rounded-xl border border-[#1a4a6e]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0a2e4d] text-gray-400 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3 font-medium">WO #</th>
            <th className="text-left px-4 py-3 font-medium">Customer</th>
            <th className="text-left px-4 py-3 font-medium">Priority</th>
            <th className="text-left px-4 py-3 font-medium">Items</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1a4a6e]">
          {workOrders.map((wo) => (
            <tr key={wo.workOrderId} className="hover:bg-[#0a2e4d]/50 transition-colors">
              <td className="px-4 py-3 font-mono text-[#00C895] text-xs">{wo.workOrderId}</td>
              <td className="px-4 py-3 text-white">{wo.customerName}</td>
              <td className="px-4 py-3">
                <PriorityBadge priority={wo.priority} />
              </td>
              <td className="px-4 py-3 text-gray-300">
                {wo.items.map((item, i) => {
                  const sweet = sweetMap[item.sweetType];
                  return (
                    <span key={i} className="mr-1.5">
                      {sweet?.emoji || '🍬'}×{item.quantity}
                    </span>
                  );
                })}
                {wo.items.length === 0 && <span className="text-gray-600">—</span>}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={wo.status} />
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                {wo.createdAt ? new Date(wo.createdAt).toLocaleTimeString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Schedule View (Gantt-lite) ──────────────────────────────── */
function ScheduleView({ workOrders }) {
  const scheduled = workOrders.filter((wo) => wo.scheduledStart && wo.scheduledEnd);

  if (scheduled.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No scheduled work orders to display on timeline.
      </div>
    );
  }

  // Determine time range
  const allStarts = scheduled.map((wo) => new Date(wo.scheduledStart).getTime());
  const allEnds = scheduled.map((wo) => new Date(wo.scheduledEnd).getTime());
  const rangeStart = Math.min(...allStarts);
  const rangeEnd = Math.max(...allEnds);
  const rangeDuration = rangeEnd - rangeStart || 1;

  // Time markers
  const markerCount = 6;
  const markers = Array.from({ length: markerCount }, (_, i) => {
    const t = rangeStart + (rangeDuration * i) / (markerCount - 1);
    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  return (
    <div className="bg-[#0a2e4d] border border-[#1a4a6e] rounded-xl p-4 flex flex-col gap-3">
      {/* Timeline header */}
      <div className="flex justify-between text-[10px] text-gray-500 font-mono px-0">
        {markers.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>

      {/* Bars */}
      <div className="flex flex-col gap-2">
        {scheduled.map((wo) => {
          const start = new Date(wo.scheduledStart).getTime();
          const end = new Date(wo.scheduledEnd).getTime();
          const leftPct = ((start - rangeStart) / rangeDuration) * 100;
          const widthPct = Math.max(((end - start) / rangeDuration) * 100, 2);
          const statusCfg = STATUS_CONFIG[wo.status] || STATUS_CONFIG.created;

          return (
            <div key={wo.workOrderId} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs font-mono text-gray-400 truncate">
                {wo.workOrderId}
              </div>
              <div className="flex-1 h-7 bg-[#03213B] rounded relative overflow-hidden">
                <div
                  className="absolute top-0.5 bottom-0.5 rounded flex items-center px-2 text-[10px] font-medium text-white whitespace-nowrap overflow-hidden"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: statusCfg.barColor,
                    opacity: 0.85,
                  }}
                >
                  {wo.customerName}
                </div>
              </div>
              <div className="w-16 shrink-0">
                <StatusBadge status={wo.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[#1a4a6e]">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.barColor }} />
            {cfg.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Badges ──────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
  return (
    <span className={`inline-flex text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function extractStatusFromTopic(topic) {
  if (!topic) return 'created';
  if (topic.includes('/completed')) return 'completed';
  if (topic.includes('/released')) return 'in-progress';
  if (topic.includes('/scheduled')) return 'scheduled';
  return 'created';
}

function statusRank(status) {
  const ranks = { created: 0, scheduled: 1, released: 2, 'in-progress': 3, completed: 4 };
  return ranks[status] ?? 0;
}
