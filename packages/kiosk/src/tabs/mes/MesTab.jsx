import { useMemo } from 'react';
import { useSubscription } from '../../broker/useSolace.js';
import { WILDCARDS, shortTopic as stripPrefix } from '../../constants/topics.js';
import { MES_TARGETS } from '../../constants/demo-data.js';
import { STATUS_COLORS, gradeVsTarget } from '../../constants/theme.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const MES_PREFIX = WILDCARDS.MES;

// ─── OEE ARC GAUGE ─────────────────────────────────────────────────────
function OeeArcGauge({ value }) {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // half-circle
  const offset = circumference - value * circumference;
  const percentage = (value * 100).toFixed(1);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} className="overflow-visible">
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(5,46,34,0.08)"
          strokeWidth={strokeWidth}
        />
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="#00c895"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span className="text-3xl font-mono text-[#052e22] -mt-8">{percentage}%</span>
      <span className="t-label text-[#052e22]/65 uppercase tracking-widest mt-1">OEE</span>
    </div>
  );
}

// ─── PRODUCTION PIPELINE ────────────────────────────────────────────────
const STATE_STYLE = {
  queued: { dot: 'bg-[#052e22]/30', border: 'border-[#052e22]/15', text: 'text-[#052e22]/70' },
  active: { dot: 'bg-[#00c895] animate-live', border: 'border-[#00c895]/50', text: 'text-[#052e22]' },
  done: { dot: 'bg-[#00c895]/40', border: 'border-[#00c895]/22', text: 'text-[#052e22]/55' },
};

function PipelineColumn({ title, items, state, accent }) {
  const s = STATE_STYLE[state];
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className={`w-1.5 h-1.5 ${s.dot}`} />
        <span className="t-label text-[#052e22]/65 uppercase tracking-wider">{title}</span>
        <span className="t-label font-mono text-[#052e22]/45 ml-auto">{items.length}</span>
      </div>
      <div className="space-y-1 min-h-[120px] max-h-[120px] overflow-y-auto pr-0.5">
        {items.slice(0, 8).map((wo) => (
          <div
            key={wo.workOrderId}
            className={`px-2 py-1 border ${s.border} ${accent ? 'bg-[#00c895]/[0.06]' : 'bg-[#00c895]/[0.02]'} t-label font-mono ${s.text} flex items-center justify-between gap-1`}
          >
            <span className="truncate">{wo.workOrderId}</span>
            {wo.totalUnits ? (
              <span className="shrink-0 text-[#052e22]/45">
                {state === 'done' ? `${wo.packaged}/${wo.totalUnits}` : state === 'active' ? `${wo.packaged}/${wo.totalUnits}` : `${wo.totalUnits}u`}
              </span>
            ) : null}
          </div>
        ))}
        {items.length === 0 && <div className="px-2 py-1 t-label text-[#052e22]/35">—</div>}
      </div>
    </div>
  );
}

function ProductionPipeline({ pipeline }) {
  return (
    <div className="flex gap-3">
      <PipelineColumn title="Queued" items={pipeline.queued} state="queued" />
      <PipelineColumn title="Active" items={pipeline.active} state="active" accent />
      <PipelineColumn title="Done" items={pipeline.done} state="done" />
    </div>
  );
}

// ─── ACTIVE BATCH PROGRESS ──────────────────────────────────────────────
function BatchProgress({ active }) {
  const pct = active && active.totalUnits ? Math.round((active.packaged / active.totalUnits) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="t-label text-[#052e22]/65 uppercase tracking-wider">Active Batch</span>
        {active && (
          <span className="t-label font-mono text-[#052e22]/82 border border-[#00c895]/28 px-1.5 py-0.5">
            {active.workOrderId}
          </span>
        )}
      </div>

      {active ? (
        <>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-2xl text-[#052e22]">
              {active.packaged}
              <span className="text-[#052e22]/45 text-lg"> / {active.totalUnits}</span>
            </span>
            <span className="t-label text-[#052e22]/55 uppercase tracking-wider">units packaged</span>
          </div>
          <div className="h-1.5 bg-[#00c895]/10 overflow-hidden">
            <div className="h-full bg-[#00c895] transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          {active.customer && (
            <div className="t-label font-mono text-[#052e22]/55">for {active.customer}</div>
          )}
        </>
      ) : (
        <div className="t-label font-mono text-[#052e22]/45 py-3">Line idle — awaiting released work order.</div>
      )}
    </div>
  );
}

// ─── STAT BOX (with target + color) ──────────────────────────────────────
function StatBox({ label, value, unit, target, dir, warnBand }) {
  const grade = gradeVsTarget(parseFloat(value), target, dir, warnBand);
  const color = STATUS_COLORS[grade];
  return (
    <div className="flex-1 border border-[#00c895]/28 px-3 py-2 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="t-label text-[#052e22]/55 uppercase tracking-wider">{label}</div>
        <span className="w-1.5 h-1.5 rounded-card" style={{ backgroundColor: color }} />
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-2xl font-mono" style={{ color }}>{value}</span>
        <span className="t-label font-mono text-[#052e22]/55">{unit}</span>
      </div>
      <div className="t-label font-mono text-[#052e22]/45 mt-0.5">
        target {dir === 'lower' ? '≤' : '≥'} {target}{unit}
      </div>
    </div>
  );
}

// ─── EVENT LOG ROW ───────────────────────────────────────────────────────
function describe(evt) {
  const p = evt.payload || {};
  const short = stripPrefix(evt.topic || '').replace(/^mes\//, '');

  if (evt.topic?.includes('order/completed')) {
    return { text: `ORDER COMPLETE — packaged ${p.unitsPackaged}/${p.totalUnits}`, wo: p.workOrderId, kind: 'done' };
  }
  if (evt.topic?.includes('production/complete')) {
    return { text: `production complete · ${p.unitsPackaged ?? p.unitsProduced}/${p.unitsProduced} packaged`, wo: p.workOrderId, kind: 'done' };
  }
  if (evt.topic?.includes('production/started')) {
    return { text: `production started · ${p.unitCount} units`, wo: p.workOrderId, kind: 'info' };
  }
  if (evt.topic?.includes('quality/check')) {
    const pass = p.result === 'pass';
    return {
      text: `QC ${pass ? 'pass' : 'FAIL'} · ${p.sweetName || ''} · packaged ${p.packagedSoFar}/${p.totalUnits}`,
      wo: p.workOrderId,
      kind: pass ? 'ok' : 'fail',
    };
  }
  if (evt.topic?.includes('step-begun')) {
    return { text: `pick unit ${p.unitIndex}/${p.totalUnits} · ${p.sweetName || ''}`, wo: p.workOrderId, kind: 'info' };
  }
  if (evt.topic?.includes('step-complete')) {
    return { text: `packed unit ${p.unitIndex}/${p.totalUnits}`, wo: p.workOrderId, kind: 'info' };
  }
  if (evt.topic?.includes('oee/update')) {
    return { text: `OEE ${p.oee?.toFixed?.(1) ?? p.oee}% · ${p.unitsPerHour} u/h`, wo: null, kind: 'muted' };
  }
  return { text: short, wo: p.workOrderId, kind: 'muted' };
}

const KIND_COLOR = {
  done: 'text-[#00c895]',
  ok: 'text-[#052e22]/82',
  fail: 'text-[#ef4444]',
  info: 'text-[#052e22]/72',
  muted: 'text-[#052e22]/45',
};

function LogRow({ evt }) {
  const d = describe(evt);
  return (
    <div className="flex items-center gap-2 font-mono t-label py-0.5 border-b border-[#00c895]/[0.05]">
      <span className="text-[#052e22]/40 shrink-0">
        {new Date(evt._receivedAt).toLocaleTimeString('en-GB', { hour12: false })}
      </span>
      <span className={`${KIND_COLOR[d.kind]} flex-1 truncate`}>{d.text}</span>
      {d.wo && <span className="text-[#052e22]/50 shrink-0">{d.wo}</span>}
    </div>
  );
}

// ─── MAIN TAB ───────────────────────────────────────────────────────────
export default function MesTab() {
  // Deep buffer so created/complete events for a work order coexist long
  // enough to build the pipeline (DIRECT messaging has no replay).
  const events = useSubscription(MES_PREFIX, 400);

  // Latest OEE + KPI snapshot from oee/update.
  const kpi = useMemo(() => {
    const oeeEvt = events.find((e) => e.topic?.includes('oee/update'));
    const p = oeeEvt?.payload || {};
    return {
      oee: (p.oee ?? 80) / 100,
      availability: (p.availability ?? 94) / 100,
      performance: (p.performance ?? 87) / 100,
      quality: (p.quality ?? 98) / 100,
      unitsPerHour: p.unitsPerHour ?? 148,
      uptime: p.uptime ?? 99.1,
      cycleTime: p.cycleTime ?? 4.1,
      defectRate: p.defectRate ?? 0.9,
    };
  }, [events]);

  // Build the QUEUED / ACTIVE / DONE pipeline from real work-order events.
  const pipeline = useMemo(() => {
    const wo = new Map();
    // events are newest-first; walk oldest-first so status transitions apply in order.
    for (const e of [...events].reverse()) {
      const p = e.payload || {};
      const id = p.workOrderId;
      if (!id) continue;
      if (!wo.has(id)) {
        wo.set(id, { workOrderId: id, status: 'queued', packaged: 0, totalUnits: p.unitCount || p.totalUnits || 0, customer: custName(p.customer) });
      }
      const rec = wo.get(id);
      if (p.unitCount || p.totalUnits) rec.totalUnits = p.unitCount || p.totalUnits;
      if (custName(p.customer)) rec.customer = custName(p.customer);
      if (typeof p.packagedSoFar === 'number') rec.packaged = p.packagedSoFar;
      if (typeof p.unitsPackaged === 'number') rec.packaged = p.unitsPackaged;

      if (e.topic?.includes('production/started')) rec.status = 'active';
      if (e.topic?.includes('order/completed') || e.topic?.includes('production/complete')) rec.status = 'done';
    }
    const all = [...wo.values()];
    return {
      queued: all.filter((w) => w.status === 'queued'),
      active: all.filter((w) => w.status === 'active'),
      done: all.filter((w) => w.status === 'done').reverse(), // newest done first
    };
  }, [events]);

  const active = pipeline.active[0] || null;
  const T = MES_TARGETS;

  return (
    <div className="h-full p-3 overflow-y-auto bg-[#ecfdf5]">
      {/* ─── TOP: KPI STATS (units/hr, uptime, cycle, defect) ─── */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatBox label="Units/hr" value={kpi.unitsPerHour} {...T.unitsPerHour} />
        <StatBox label="Uptime" value={kpi.uptime} {...T.uptime} />
        <StatBox label="Cycle" value={kpi.cycleTime} {...T.cycleTime} />
        <StatBox label="Defect" value={kpi.defectRate} {...T.defectRate} />
      </div>

      <div className="grid grid-cols-12 gap-3 auto-rows-min">
        {/* ─── LEFT: OEE + BATCH ─────────────────────────────── */}
        <div className="col-span-5 flex flex-col gap-3">
          <div className="border border-[#00c895]/28 bg-white p-4">
            <div className="t-label text-[#052e22]/65 uppercase tracking-wider mb-3">Overall Equipment Effectiveness</div>
            <div className="flex items-center gap-4">
              <OeeArcGauge value={kpi.oee} />
              <div className="flex flex-col gap-1.5 font-mono t-data">
                <Row label="A" name="Availability" value={kpi.availability} />
                <Row label="P" name="Performance" value={kpi.performance} />
                <Row label="Q" name="Quality" value={kpi.quality} />
              </div>
            </div>
          </div>

          <div className="border border-[#00c895]/28 bg-white p-4 flex-1">
            <BatchProgress active={active} />
          </div>
        </div>

        {/* ─── RIGHT: PIPELINE + LOG + STATS ─────────────────── */}
        <div className="col-span-7 flex flex-col gap-3">
          <div className="border border-[#00c895]/28 bg-white p-4">
            <div className="t-label text-[#052e22]/65 uppercase tracking-wider mb-2">Production Pipeline</div>
            <ProductionPipeline pipeline={pipeline} />
          </div>

          <div className="border border-[#00c895]/28 bg-white p-3 flex-1 min-h-0">
            <div className="flex items-center justify-between mb-1">
              <span className="t-label text-[#052e22]/65 uppercase tracking-wider">Event Log</span>
              <span className="t-label font-mono text-[#052e22]/45">{events.length}</span>
            </div>
            <div className="max-h-[150px] overflow-y-auto">
              {events.slice(0, 40).map((evt, i) => (
                <LogRow key={evt.eventId || i} evt={evt} />
              ))}
              {events.length === 0 && (
                <div className="t-label font-mono text-[#052e22]/45 py-2">Awaiting MES events...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, name, value }) {
  return (
    <div className="flex items-center gap-2 text-[#052e22]/82">
      <span className="text-[#052e22]/45 t-label w-3">{label}</span>
      <span className="w-[110px] t-label text-[#052e22]/55 uppercase tracking-wider">{name}</span>
      <span>{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

function custName(customer) {
  if (!customer) return null;
  return customer.name || (typeof customer === 'string' ? customer : null);
}
