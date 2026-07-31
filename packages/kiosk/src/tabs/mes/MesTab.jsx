import { useState, useEffect } from 'react';
import { useSubscription } from '../../broker/useSolace.js';
import { WILDCARDS, shortTopic as stripPrefix } from '../../constants/topics.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const STEPS = ['Init', 'Pick-1', 'Pick-2', 'Pack', 'QC'];
const MES_PREFIX = WILDCARDS.MES;

// ─── OEE ARC GAUGE ─────────────────────────────────────────────────────
function OeeArcGauge({ value }) {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // half-circle
  const offset = circumference - (value * circumference);
  const percentage = (value * 100).toFixed(1);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} className="overflow-visible">
        {/* Track */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Value arc */}
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
function ProductionPipeline({ workOrders }) {
  const queued = workOrders.filter((wo) => wo.status === 'queued');
  const inProgress = workOrders.filter((wo) => wo.status === 'in-progress');
  const complete = workOrders.filter((wo) => wo.status === 'complete');

  const Column = ({ title, items }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="t-label text-[#052e22]/65 uppercase tracking-wider">{title}</span>
        <span className="t-label font-mono text-[#052e22]/55">{items.length}</span>
      </div>
      <div className="space-y-0.5 max-h-[130px] overflow-y-auto">
        {items.slice(0, 8).map((wo) => (
          <div key={wo.id} className="px-2 py-1 bg-[#00c895]/5 border border-[#00c895]/28 t-label font-mono text-[#052e22]/88">
            {wo.id} <span className="text-[#052e22]/55">({wo.status})</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-2 py-1 t-label text-[#052e22]/45">—</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex divide-x divide-white/10">
      <Column title="QUEUED" items={queued} />
      <Column title="ACTIVE" items={inProgress} />
      <Column title="DONE" items={complete} />
    </div>
  );
}

// ─── BATCH PROGRESS ─────────────────────────────────────────────────────
function BatchProgress({ currentStep, workOrderId }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="t-label text-[#052e22]/65 uppercase tracking-wider">Active Batch</span>
        {workOrderId && (
          <span className="t-label font-mono text-[#052e22]/82 border border-[#00c895]/28 px-1.5 py-0.5">
            {workOrderId}
          </span>
        )}
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-[#00c895]/10 overflow-hidden">
        <div
          className="h-full bg-[#00c895] transition-all duration-500"
          style={{ width: `${((currentStep) / STEPS.length) * 100}%` }}
        />
      </div>
      {/* Step indicators */}
      <div className="flex items-center gap-2 font-mono t-label">
        {STEPS.map((step, i) => {
          const isDone = i < currentStep;
          const isCurrent = i === currentStep;
          return (
            <span key={step} className={`${isDone ? 'text-[#052e22]/82' : isCurrent ? 'text-[#00c895]' : 'text-[#052e22]/45'}`}>
              {isDone ? '[✓]' : isCurrent ? '[▶]' : '[○]'} {step}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── STAT BOX ───────────────────────────────────────────────────────────
function StatBox({ label, value, unit }) {
  return (
    <div className="flex-1 border border-[#00c895]/28 px-3 py-2">
      <div className="t-label text-[#052e22]/55 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-2xl font-mono text-[#052e22]">{value}</span>
        <span className="t-label font-mono text-[#052e22]/55">{unit}</span>
      </div>
    </div>
  );
}

// ─── MAIN TAB ───────────────────────────────────────────────────────────
export default function MesTab() {
  const events = useSubscription(MES_PREFIX);

  const [oee, setOee] = useState({ availability: 0.94, performance: 0.87, quality: 0.98, oee: 0.80 });
  const [currentStep, setCurrentStep] = useState(0);
  const [activeWorkOrder, setActiveWorkOrder] = useState(null);
  const [workOrders, setWorkOrders] = useState([
    { id: 'WO-2024-001', status: 'complete' },
    { id: 'WO-2024-002', status: 'complete' },
    { id: 'WO-2024-003', status: 'in-progress' },
    { id: 'WO-2024-004', status: 'queued' },
    { id: 'WO-2024-005', status: 'queued' },
    { id: 'WO-2024-006', status: 'queued' },
  ]);
  const [stats, setStats] = useState({
    unitsPerHour: 142,
    uptime: '99.2',
    cycleTime: '4.2',
    defectRate: '0.8',
  });
  const [completedToday, setCompletedToday] = useState(847);

  // Process incoming events
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    const { topic } = latest;

    if (topic?.includes('oee/update')) {
      setOee({
        availability: latest.availability ?? oee.availability,
        performance: latest.performance ?? oee.performance,
        quality: latest.quality ?? oee.quality,
        oee: latest.oee ?? oee.oee,
      });
    }

    if (topic?.includes('production/step-begun')) {
      setCurrentStep(latest.stepIndex ?? currentStep);
      setActiveWorkOrder(latest.workOrderId ?? activeWorkOrder);
    }

    if (topic?.includes('production/step-complete')) {
      const nextStep = (latest.stepIndex ?? currentStep) + 1;
      setCurrentStep(Math.min(nextStep, STEPS.length));
    }

    if (topic?.includes('production/started')) {
      setActiveWorkOrder(latest.workOrderId);
      setCurrentStep(0);
      setWorkOrders((prev) => prev.map((wo) =>
        wo.id === latest.workOrderId ? { ...wo, status: 'in-progress' } : wo
      ));
    }

    if (topic?.includes('production/complete')) {
      setCompletedToday((c) => c + 1);
      setStats((s) => ({ ...s, unitsPerHour: Math.min(160, s.unitsPerHour + 1) }));
      setWorkOrders((prev) => prev.map((wo) =>
        wo.id === latest.workOrderId ? { ...wo, status: 'complete' } : wo
      ));
      setCurrentStep(0);
    }

    if (topic?.includes('quality/check')) {
      if (latest.result === 'fail') {
        setStats((s) => ({ ...s, defectRate: (parseFloat(s.defectRate) + 0.1).toFixed(1) }));
      }
    }
  }, [events.length]);

  return (
    <div className="h-full p-3 overflow-y-auto bg-[#ecfdf5]">
      <div className="grid grid-cols-12 gap-3 h-full">
        {/* ─── LEFT: OEE + BATCH ─────────────────────────────── */}
        <div className="col-span-5 flex flex-col gap-3">
          {/* OEE Section */}
          <div className="border border-[#00c895]/28 bg-[#ffffff] p-4">
            <div className="t-label text-[#052e22]/65 uppercase tracking-wider mb-3">OEE</div>
            <div className="flex items-center gap-4">
              <OeeArcGauge value={oee.oee} />
              <div className="flex flex-col gap-1 font-mono t-data">
                <div className="text-[#052e22]/82">
                  <span className="text-[#052e22]/55 t-label mr-2">A</span>
                  {(oee.availability * 100).toFixed(1)}%
                </div>
                <div className="text-[#052e22]/82">
                  <span className="text-[#052e22]/55 t-label mr-2">P</span>
                  {(oee.performance * 100).toFixed(1)}%
                </div>
                <div className="text-[#052e22]/82">
                  <span className="text-[#052e22]/55 t-label mr-2">Q</span>
                  {(oee.quality * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Active Batch */}
          <div className="border border-[#00c895]/28 bg-[#ffffff] p-4 flex-1">
            <BatchProgress
              currentStep={currentStep}
              workOrderId={activeWorkOrder || workOrders.find(wo => wo.status === 'in-progress')?.id}
            />
          </div>
        </div>

        {/* ─── RIGHT: PIPELINE + STATS ───────────────────────── */}
        <div className="col-span-7 flex flex-col gap-3">
          {/* Production Pipeline */}
          <div className="border border-[#00c895]/28 bg-[#ffffff] p-4">
            <div className="t-label text-[#052e22]/65 uppercase tracking-wider mb-2">Production Pipeline</div>
            <ProductionPipeline workOrders={workOrders} />
          </div>

          {/* Event Feed */}
          <div className="border border-[#00c895]/28 bg-[#ffffff] p-3 flex-1 min-h-0">
            <div className="flex items-center justify-between mb-1">
              <span className="t-label text-[#052e22]/65 uppercase tracking-wider">Event Log</span>
              <span className="t-label font-mono text-[#052e22]/45">{events.length}</span>
            </div>
            <div className="space-y-0 max-h-[120px] overflow-y-auto">
              {events.slice(0, 12).map((evt, i) => {
                const shortTopic = stripPrefix(evt.topic || '').replace(/^mes\//, '');
                return (
                  <div key={i} className="flex items-center gap-2 font-mono t-label py-0.5">
                    <span className="text-[#052e22]/45">{new Date(evt._receivedAt).toLocaleTimeString('en-GB', { hour12: false })}</span>
                    <span className="text-[#052e22]/72">{shortTopic}</span>
                    {evt.workOrderId && <span className="text-[#052e22]/88">{evt.workOrderId}</span>}
                  </div>
                );
              })}
              {events.length === 0 && (
                <div className="t-label font-mono text-[#052e22]/45 py-2">Awaiting MES events...</div>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex gap-0">
            <StatBox label="Units/hr" value={stats.unitsPerHour} unit="u/h" />
            <StatBox label="Uptime" value={stats.uptime} unit="%" />
            <StatBox label="Cycle" value={stats.cycleTime} unit="sec" />
            <StatBox label="Defect" value={stats.defectRate} unit="%" />
          </div>
        </div>
      </div>
    </div>
  );
}
