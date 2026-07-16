import { useState, useEffect, useMemo } from 'react';
import { useSubscription } from '../../broker/useSolace.js';
import { WILDCARDS } from '../../constants/topics.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const STEPS = ['Init', 'Pick-1', 'Pick-2', 'Pack', 'QC'];
const MES_PREFIX = WILDCARDS.MES; // haribot/paris-demo/packing/line1/mes/

// ─── OEE GAUGE COMPONENT ────────────────────────────────────────────────
function OeeGauge({ value, label, size = 160, strokeWidth = 12, color = '#00C895' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value * circumference);
  const percentage = Math.round(value * 100);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-3xl font-bold text-white">{percentage}%</span>
        <span className="text-[10px] text-white/50 uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );
}

function MiniGauge({ value, label, color }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg width={56} height={56} className="transform -rotate-90">
          <circle cx={28} cy={28} r={22} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
          <circle
            cx={28} cy={28} r={22} fill="none"
            stroke={color} strokeWidth={5}
            strokeDasharray={138.23}
            strokeDashoffset={138.23 - value * 138.23}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{pct}%</span>
        </div>
      </div>
      <span className="text-[10px] text-white/40 uppercase">{label}</span>
    </div>
  );
}

// ─── PRODUCTION PIPELINE ────────────────────────────────────────────────
function ProductionPipeline({ workOrders }) {
  const queued = workOrders.filter((wo) => wo.status === 'queued');
  const inProgress = workOrders.filter((wo) => wo.status === 'in-progress');
  const complete = workOrders.filter((wo) => wo.status === 'complete');

  const Column = ({ title, items, color }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] text-white/50 uppercase font-bold tracking-wider">{title}</span>
        <span className="text-[10px] text-white/30 ml-auto">{items.length}</span>
      </div>
      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
        {items.slice(0, 6).map((wo) => (
          <div
            key={wo.id}
            className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono text-white/80 truncate"
          >
            {wo.id}
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-2.5 py-1.5 text-[10px] text-white/20 italic">Empty</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex gap-3">
      <Column title="Queued" items={queued} color="#6366F1" />
      <Column title="In Progress" items={inProgress} color="#F59E0B" />
      <Column title="Complete" items={complete} color="#00C895" />
    </div>
  );
}

// ─── BATCH PROGRESS ─────────────────────────────────────────────────────
function BatchProgress({ currentStep, workOrderId }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Active Batch</span>
        {workOrderId && (
          <span className="text-xs font-mono text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded">
            {workOrderId}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const isDone = i < currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300
                    ${isDone ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : ''}
                    ${isCurrent ? 'bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse' : ''}
                    ${!isDone && !isCurrent ? 'border-white/20 text-white/20' : ''}
                  `}
                >
                  {isDone ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isCurrent ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <polygon points="2,0 10,5 2,10" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-current" />
                  )}
                </div>
                <span className={`text-[9px] mt-1 ${isDone ? 'text-emerald-400/70' : isCurrent ? 'text-amber-300/90' : 'text-white/30'}`}>
                  {step}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 rounded ${isDone ? 'bg-emerald-500/50' : 'bg-white/10'}`} />
              )}
            </div>
          );
        })}
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${((currentStep) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── STATS CARD ─────────────────────────────────────────────────────────
function StatCard({ label, value, unit, icon }) {
  return (
    <div className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-white">{value}</span>
        <span className="text-xs text-white/40">{unit}</span>
      </div>
    </div>
  );
}

// ─── MAIN TAB ───────────────────────────────────────────────────────────
export default function MesTab() {
  const events = useSubscription(MES_PREFIX);

  // ─── Derived State ──────────────────────────────────────────
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

  const oeeColor = oee.oee >= 0.85 ? '#00C895' : oee.oee >= 0.65 ? '#F59E0B' : '#EF4444';

  return (
    <div className="h-full p-5 overflow-y-auto">
      <div className="grid grid-cols-12 gap-4 h-full max-h-full">
        {/* ─── LEFT: OEE + BATCH ─────────────────────────────── */}
        <div className="col-span-5 flex flex-col gap-4">
          {/* OEE Section */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-4 rounded-full bg-amber-500" />
              <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Overall Equipment Effectiveness</span>
            </div>
            <div className="flex items-center justify-center gap-6">
              <div className="relative">
                <OeeGauge value={oee.oee} label="OEE" size={150} strokeWidth={14} color={oeeColor} />
              </div>
              <div className="flex flex-col gap-3">
                <MiniGauge value={oee.availability} label="Avail." color="#22D3EE" />
                <MiniGauge value={oee.performance} label="Perf." color="#A78BFA" />
                <MiniGauge value={oee.quality} label="Quality" color="#34D399" />
              </div>
            </div>
          </div>

          {/* Active Batch */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5 flex-1">
            <BatchProgress currentStep={currentStep} workOrderId={activeWorkOrder || workOrders.find(wo => wo.status === 'in-progress')?.id} />
            {/* Additional batch info */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="bg-white/[0.03] rounded px-2 py-1.5 text-center">
                <div className="text-lg font-bold text-white">{completedToday}</div>
                <div className="text-[9px] text-white/40 uppercase">Units Today</div>
              </div>
              <div className="bg-white/[0.03] rounded px-2 py-1.5 text-center">
                <div className="text-lg font-bold text-emerald-400">{Math.round(oee.oee * 100)}%</div>
                <div className="text-[9px] text-white/40 uppercase">Target: 85%</div>
              </div>
              <div className="bg-white/[0.03] rounded px-2 py-1.5 text-center">
                <div className="text-lg font-bold text-amber-400">{currentStep}/{STEPS.length}</div>
                <div className="text-[9px] text-white/40 uppercase">Step</div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: PIPELINE + STATS ───────────────────────── */}
        <div className="col-span-7 flex flex-col gap-4">
          {/* Production Pipeline */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-4 rounded-full bg-amber-500" />
              <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Production Pipeline</span>
            </div>
            <ProductionPipeline workOrders={workOrders} />
          </div>

          {/* Event Feed */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-4 rounded-full bg-amber-500" />
              <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Event Log</span>
              <span className="text-[10px] text-white/30 ml-auto">{events.length} events</span>
            </div>
            <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
              {events.slice(0, 10).map((evt, i) => {
                const shortTopic = evt.topic?.replace('haribot/paris-demo/packing/line1/mes/', '') || '';
                return (
                  <div key={i} className="flex items-center gap-2 text-[11px] font-mono py-0.5">
                    <span className="text-white/20">{new Date(evt._receivedAt).toLocaleTimeString()}</span>
                    <span className="text-amber-400/80">{shortTopic}</span>
                    {evt.workOrderId && <span className="text-white/40">{evt.workOrderId}</span>}
                  </div>
                );
              })}
              {events.length === 0 && (
                <div className="text-xs text-white/20 italic py-4 text-center">Waiting for MES events...</div>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex gap-3">
            <StatCard label="Units/hr" value={stats.unitsPerHour} unit="u/h" icon="⚡" />
            <StatCard label="Uptime" value={stats.uptime} unit="%" icon="🟢" />
            <StatCard label="Cycle Time" value={stats.cycleTime} unit="sec" icon="🔄" />
            <StatCard label="Defect Rate" value={stats.defectRate} unit="%" icon="⚠️" />
          </div>
        </div>
      </div>
    </div>
  );
}
