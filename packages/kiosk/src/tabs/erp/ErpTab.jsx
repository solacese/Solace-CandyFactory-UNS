import { useMemo } from 'react';
import { useSubscription } from '../../broker/useSolace.js';
import { WILDCARDS } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';

export default function ErpTab() {
  const erpEvents = useSubscription(WILDCARDS.ERP);

  // Aggregate work orders from events — latest status wins
  const workOrders = useMemo(() => {
    const woMap = new Map();

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
        const existing = woMap.get(id);
        const eventStatus = payload.status || extractStatusFromTopic(event.topic);
        if (statusRank(eventStatus) > statusRank(existing.status)) {
          existing.status = eventStatus;
        }
        if (payload.scheduledStart) existing.scheduledStart = payload.scheduledStart;
        if (payload.scheduledEnd) existing.scheduledEnd = payload.scheduledEnd;
      }
    }

    return [...woMap.values()].sort((a, b) => {
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

    return { total: workOrders.length, open, inProgress, completed, avgCycle };
  }, [workOrders]);

  const sweetMap = Object.fromEntries(SWEETS.map((s) => [s.id, s]));

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="t-data font-medium text-[#3b1f33] uppercase tracking-wide">ERP Work Orders</h2>
        <span className="t-label font-mono text-[#3b1f33]/30">
          L4 PLANNING | {erpEvents.length} EVT
        </span>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiBox label="TOTAL WO" value={kpis.total} />
        <KpiBox label="OPEN" value={kpis.open} />
        <KpiBox label="IN PROGRESS" value={kpis.inProgress} active />
        <KpiBox label="AVG CYCLE" value={kpis.avgCycle} />
      </div>

      {/* Work Order Table */}
      {workOrders.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[#3b1f33]/20 t-label font-mono">
          NO WORK ORDERS — SUBMIT AN ORDER FROM MARKETPLACE
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto border border-[#ec4899]/10">
          <table className="w-full t-label">
            <thead>
              <tr className="t-label uppercase text-[#3b1f33]/30 border-b border-[#ec4899]/10">
                <th className="text-left px-3 py-2 font-medium">WO#</th>
                <th className="text-left px-3 py-2 font-medium">Customer</th>
                <th className="text-left px-3 py-2 font-medium">PRI</th>
                <th className="text-left px-3 py-2 font-medium">Items</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.workOrderId} className="border-b border-[#ec4899]/5 hover:bg-[#ec4899]/[0.02]">
                  <td className="px-3 py-2 font-mono text-[#3b1f33]/80">{wo.workOrderId}</td>
                  <td className="px-3 py-2 text-[#3b1f33]">{wo.customerName}</td>
                  <td className="px-3 py-2">
                    <span className={`font-mono uppercase ${wo.priority === 'high' ? 'text-[#3b1f33]' : 'text-[#3b1f33]/50'}`}>
                      {wo.priority === 'high' ? 'HIGH' : wo.priority === 'medium' ? 'MED' : 'LOW'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#3b1f33]/60 font-mono">
                    {wo.items.map((item, i) => {
                      const sweet = sweetMap[item.sweetType];
                      return (
                        <span key={i}>
                          {sweet?.emoji}x{item.quantity}
                          {i < wo.items.length - 1 && ' '}
                        </span>
                      );
                    })}
                    {wo.items.length === 0 && <span className="text-[#3b1f33]/20">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[#3b1f33]/70">
                    [{wo.status?.toUpperCase() || 'CREATED'}]
                  </td>
                  <td className="px-3 py-2 font-mono text-[#3b1f33]/30">
                    {wo.createdAt ? new Date(wo.createdAt).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── KPI Box ────────────────────────────────────────────────── */
function KpiBox({ label, value, active }) {
  return (
    <div className="border border-[#ec4899]/10 px-3 py-3 flex flex-col gap-1">
      <div className={`text-2xl font-mono font-bold ${active ? 'text-[#ec4899]' : 'text-[#3b1f33]'}`}>
        {value}
      </div>
      <div className="t-label uppercase tracking-widest text-[#3b1f33]/40 font-mono">{label}</div>
    </div>
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
