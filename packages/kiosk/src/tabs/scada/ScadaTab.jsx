import { useState, useEffect, useRef, useCallback } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { WILDCARDS, SCADA } from '../../constants/topics.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const SCADA_PREFIX = WILDCARDS.SCADA;
const MAX_SPARKLINE_POINTS = 20;

const STATUS_COLORS = {
  normal: '#00C895',
  warning: '#F59E0B',
  alarm: '#EF4444',
};

// ─── ALARM BANNER ───────────────────────────────────────────────────────
function AlarmBanner({ alarms, onAcknowledge }) {
  if (alarms.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-red-900/40 to-red-800/20 border border-red-500/30 rounded-lg px-4 py-2 animate-pulse">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-red-400 text-sm animate-bounce">🚨</span>
        <span className="text-[10px] text-red-300 uppercase font-bold tracking-widest">Active Alarms</span>
        <span className="text-[10px] bg-red-500/30 text-red-200 px-1.5 rounded font-bold ml-auto">
          {alarms.length}
        </span>
      </div>
      <div className="space-y-1 max-h-[80px] overflow-y-auto">
        {alarms.map((alarm, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${alarm.severity === 'critical' ? 'bg-red-500 animate-ping' : 'bg-amber-500'}`} />
            <span className={alarm.severity === 'critical' ? 'text-red-300' : 'text-amber-300'}>
              {alarm.severity === 'critical' ? '🔴' : '🟡'}
            </span>
            <span className="text-white/80 flex-1 truncate">{alarm.message}</span>
            <span className="text-white/30 text-[10px] font-mono">
              {alarm.timestamp ? new Date(alarm.timestamp).toLocaleTimeString() : ''}
            </span>
            <button
              onClick={() => onAcknowledge(alarm)}
              className="px-2 py-0.5 text-[10px] font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/40 rounded hover:bg-red-500/40 transition-colors"
            >
              ACK
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SPARKLINE ──────────────────────────────────────────────────────────
function Sparkline({ values, color = '#00C895', width = 100, height = 30 }) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} className="opacity-30" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  // Area fill
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      {values.length > 0 && (() => {
        const lastX = width;
        const lastY = height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;
        return <circle cx={lastX} cy={lastY} r="2.5" fill={color} />;
      })()}
    </svg>
  );
}

// ─── SENSOR CARD ────────────────────────────────────────────────────────
function SensorCard({ sensorId, sensorType, value, unit, status, history }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.normal;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 flex flex-col gap-2 relative overflow-hidden">
      {/* Status indicator */}
      <div className={`absolute top-0 left-0 w-full h-0.5`} style={{ backgroundColor: color }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/40 uppercase">{sensorId}</span>
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: status !== 'normal' ? `0 0 6px ${color}` : 'none' }}
          />
        </div>
        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
          status === 'normal' ? 'bg-emerald-500/10 text-emerald-400' :
          status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
          'bg-red-500/10 text-red-400'
        }`}>
          {status}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toFixed(1) : value}</span>
        <span className="text-xs text-white/40">{unit}</span>
      </div>
      <div className="text-[9px] text-white/30 uppercase">{sensorType}</div>
      <Sparkline values={history} color={color} width={120} height={24} />
    </div>
  );
}

// ─── PROCESS DIAGRAM (SVG) ──────────────────────────────────────────────
function ProcessDiagram({ processValues }) {
  const sections = [
    { id: 'hopper', label: 'Hopper', x: 20, width: 80 },
    { id: 'conveyorA', label: 'Conv. A', x: 130, width: 100 },
    { id: 'pickZone', label: 'Pick Zone', x: 260, width: 90 },
    { id: 'conveyorB', label: 'Conv. B', x: 380, width: 100 },
    { id: 'packing', label: 'Packing', x: 510, width: 80 },
  ];

  return (
    <div className="relative">
      <svg viewBox="0 0 620 100" className="w-full h-auto" style={{ maxHeight: '110px' }}>
        {/* Background */}
        <rect x="0" y="0" width="620" height="100" fill="transparent" />

        {/* Connection pipes */}
        {sections.slice(0, -1).map((sec, i) => {
          const next = sections[i + 1];
          return (
            <line
              key={`pipe-${i}`}
              x1={sec.x + sec.width}
              y1={45}
              x2={next.x}
              y2={45}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
          );
        })}

        {/* Flow arrows */}
        {sections.slice(0, -1).map((sec, i) => {
          const midX = sec.x + sec.width + (sections[i + 1].x - sec.x - sec.width) / 2;
          return (
            <polygon
              key={`arrow-${i}`}
              points={`${midX - 4},41 ${midX + 4},45 ${midX - 4},49`}
              fill="#00C895"
              opacity="0.6"
            />
          );
        })}

        {/* Sections */}
        {sections.map((sec) => {
          const pv = processValues[sec.id];
          return (
            <g key={sec.id}>
              <rect
                x={sec.x}
                y={25}
                width={sec.width}
                height={40}
                rx="4"
                fill="rgba(0,200,149,0.06)"
                stroke="rgba(0,200,149,0.3)"
                strokeWidth="1"
              />
              <text x={sec.x + sec.width / 2} y={40} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="10" fontWeight="bold">
                {sec.label}
              </text>
              {pv && (
                <text x={sec.x + sec.width / 2} y={56} textAnchor="middle" fill="#00C895" fontSize="9" fontFamily="monospace">
                  {pv}
                </text>
              )}
            </g>
          );
        })}

        {/* Labels */}
        <text x="310" y="90" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="8" letterSpacing="3">
          PROCESS FLOW
        </text>
      </svg>
    </div>
  );
}

// ─── ANIMATED CONVEYOR ──────────────────────────────────────────────────
function ConveyorBelt({ speed, itemsInTransit, itemsProcessed }) {
  const [offset, setOffset] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    let lastTime = performance.now();
    const animate = (now) => {
      const dt = now - lastTime;
      lastTime = now;
      setOffset((prev) => (prev + (speed * dt) / 1000) % 40);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [speed]);

  const dots = [];
  for (let i = 0; i < 16; i++) {
    const x = ((i * 40 + offset) % 640);
    dots.push(
      <circle
        key={i}
        cx={x}
        cy="12"
        r="4"
        fill={i < itemsInTransit ? '#00C895' : 'rgba(255,255,255,0.1)'}
        className="transition-all duration-200"
      />
    );
  }

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-4 rounded-full bg-red-500" />
        <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold">Conveyor System</span>
      </div>
      {/* Animated belt */}
      <div className="bg-black/30 rounded-lg p-2 mb-3 overflow-hidden">
        <svg viewBox="0 0 640 24" className="w-full h-6">
          {/* Belt tracks */}
          <rect x="0" y="8" width="640" height="8" rx="4" fill="rgba(255,255,255,0.05)" />
          <rect x="0" y="10" width="640" height="4" rx="2" fill="rgba(255,255,255,0.03)" />
          {/* Moving dots */}
          {dots}
          {/* End caps */}
          <circle cx="10" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <circle cx="630" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
        </svg>
      </div>
      {/* Stats */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Speed:</span>
          <span className="text-sm font-mono font-bold text-white">{speed.toFixed(1)}</span>
          <span className="text-[10px] text-white/30">m/s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">In Transit:</span>
          <span className="text-sm font-mono font-bold text-cyan-400">{itemsInTransit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Processed Today:</span>
          <span className="text-sm font-mono font-bold text-emerald-400">{itemsProcessed.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN TAB ───────────────────────────────────────────────────────────
export default function ScadaTab() {
  const events = useSubscription(SCADA_PREFIX);
  const publish = usePublish();

  // ─── State ────────────────────────────────────────────────────
  const [alarms, setAlarms] = useState([]);
  const [sensors, setSensors] = useState({
    'TEMP-01': { sensorId: 'TEMP-01', sensorType: 'Temperature', value: 72.4, unit: '°C', status: 'normal', history: [71, 71.5, 72, 72.2, 72.4] },
    'PRES-01': { sensorId: 'PRES-01', sensorType: 'Pressure', value: 2.4, unit: 'bar', status: 'normal', history: [2.3, 2.35, 2.4, 2.38, 2.4] },
    'VIB-01': { sensorId: 'VIB-01', sensorType: 'Vibration', value: 0.12, unit: 'mm/s', status: 'normal', history: [0.1, 0.11, 0.12, 0.11, 0.12] },
    'FLOW-01': { sensorId: 'FLOW-01', sensorType: 'Flow Rate', value: 145.2, unit: 'L/min', status: 'normal', history: [144, 145, 145.5, 144.8, 145.2] },
    'HUMID-01': { sensorId: 'HUMID-01', sensorType: 'Humidity', value: 45.8, unit: '%RH', status: 'normal', history: [45, 45.2, 45.5, 45.7, 45.8] },
    'RPM-01': { sensorId: 'RPM-01', sensorType: 'Motor Speed', value: 1480, unit: 'RPM', status: 'normal', history: [1475, 1478, 1480, 1479, 1480] },
  });
  const [conveyorSpeed, setConveyorSpeed] = useState(1.2);
  const [itemsInTransit, setItemsInTransit] = useState(5);
  const [itemsProcessed, setItemsProcessed] = useState(2847);
  const [processValues, setProcessValues] = useState({
    hopper: '85% full',
    conveyorA: '1.2 m/s',
    pickZone: '72.4°C',
    conveyorB: '1.2 m/s',
    packing: '142 u/hr',
  });

  // ─── Process events ───────────────────────────────────────────
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    const { topic } = latest;

    if (topic?.includes('sensor/reading')) {
      const { sensorId, sensorType, value, unit, status } = latest;
      if (sensorId) {
        setSensors((prev) => {
          const existing = prev[sensorId] || { sensorId, sensorType: sensorType || 'Unknown', value: 0, unit: unit || '', status: 'normal', history: [] };
          const history = [...existing.history, value].slice(-MAX_SPARKLINE_POINTS);
          return { ...prev, [sensorId]: { ...existing, sensorType: sensorType || existing.sensorType, value, unit: unit || existing.unit, status: status || existing.status, history } };
        });
      }
    }

    if (topic?.includes('alarm/raised')) {
      setAlarms((prev) => [latest, ...prev].slice(0, 10));
    }

    if (topic?.includes('alarm/acknowledged')) {
      setAlarms((prev) => prev.filter((a) => a.alarmCode !== latest.alarmCode));
    }

    if (topic?.includes('conveyor/status')) {
      if (latest.speed !== undefined) setConveyorSpeed(latest.speed);
      if (latest.itemsInTransit !== undefined) setItemsInTransit(latest.itemsInTransit);
      if (latest.itemsProcessed !== undefined) setItemsProcessed(latest.itemsProcessed);
      setProcessValues((pv) => ({
        ...pv,
        conveyorA: `${(latest.speed || conveyorSpeed).toFixed(1)} m/s`,
        conveyorB: `${(latest.speed || conveyorSpeed).toFixed(1)} m/s`,
      }));
    }

    if (topic?.includes('process/value')) {
      if (latest.section && latest.displayValue) {
        setProcessValues((pv) => ({ ...pv, [latest.section]: latest.displayValue }));
      }
    }
  }, [events.length]);

  // ─── ACK handler ──────────────────────────────────────────────
  const handleAcknowledge = useCallback((alarm) => {
    publish(SCADA.ALARM_ACKNOWLEDGED, {
      alarmCode: alarm.alarmCode,
      acknowledgedAt: new Date().toISOString(),
    });
    setAlarms((prev) => prev.filter((a) => a.alarmCode !== alarm.alarmCode));
  }, [publish]);

  const sensorList = Object.values(sensors);

  return (
    <div className="h-full p-5 overflow-y-auto flex flex-col gap-4">
      {/* ─── ALARM BANNER ─────────────────────────────────── */}
      <AlarmBanner alarms={alarms} onAcknowledge={handleAcknowledge} />

      {/* ─── PROCESS DIAGRAM ──────────────────────────────── */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-4 rounded-full bg-red-500" />
          <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Process Overview</span>
          <span className="text-[10px] text-white/20 ml-auto font-mono">LIVE</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <ProcessDiagram processValues={processValues} />
      </div>

      {/* ─── SENSOR GRID ──────────────────────────────────── */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-4 rounded-full bg-red-500" />
          <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Sensor Array</span>
          <span className="text-[10px] text-white/30 ml-auto">{sensorList.length} sensors</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {sensorList.slice(0, 6).map((sensor) => (
            <SensorCard key={sensor.sensorId} {...sensor} />
          ))}
        </div>
      </div>

      {/* ─── CONVEYOR BELT ────────────────────────────────── */}
      <ConveyorBelt speed={conveyorSpeed} itemsInTransit={itemsInTransit} itemsProcessed={itemsProcessed} />
    </div>
  );
}
