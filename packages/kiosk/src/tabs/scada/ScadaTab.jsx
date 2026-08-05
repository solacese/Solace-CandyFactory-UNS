import { useState, useEffect, useCallback } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { WILDCARDS, SCADA } from '../../constants/topics.js';
import { SENSORS, SENSOR_TARGETS } from '../../constants/demo-data.js';
import { STATUS_COLORS, gradeVsBand } from '../../constants/theme.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const SCADA_PREFIX = WILDCARDS.SCADA;
const MAX_POINTS = 40;

// Seed one card per sensor the engine actually publishes.
function seedSensors() {
  const out = {};
  for (const s of SENSORS) {
    out[s.id] = {
      sensorId: s.id,
      type: s.type,
      value: s.base,
      unit: s.unit,
      location: s.location,
      history: [s.base],
    };
  }
  return out;
}

// ─── ALARM BANNER ───────────────────────────────────────────────────────
function AlarmBanner({ alarms, onAcknowledge }) {
  if (alarms.length === 0) return null;
  return (
    <div className="border border-[#ef4444]/40 border-l-2 border-l-[#ef4444] bg-white px-3 py-2">
      {alarms.map((alarm, i) => (
        <div key={i} className="flex items-center gap-3 t-label font-mono py-0.5">
          <span className="text-[#ef4444] font-bold">[ALARM]</span>
          <span className="text-[#04121f]/90 flex-1 truncate">{alarm.message}</span>
          <span className="text-[#04121f]/68">
            {alarm.timestamp ? new Date(alarm.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : ''}
          </span>
          <button
            onClick={() => onAcknowledge(alarm)}
            className="px-2 py-0.5 t-label uppercase border border-[#00c895]/48 text-[#04121f] hover:bg-[#00c895]/10 transition-colors"
          >
            ACK
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── TIME-SERIES PLOT (with target line + normal band as vertical bars) ──
function TimeSeriesPlot({ values, target, lo, hi, color, width = 150, height = 44 }) {
  if (!values || values.length < 2) return <svg width={width} height={height} />;

  // Scale to include the band so the target/limits are always visible.
  const dataMin = Math.min(...values, lo);
  const dataMax = Math.max(...values, hi);
  const pad = (dataMax - dataMin) * 0.12 || 1;
  const min = dataMin - pad;
  const max = dataMax + pad;
  const range = max - min || 1;

  // Reserve a right-hand gutter for the vertical band-limit axis.
  const AXIS = 26;
  const plotW = width - AXIS;

  const y = (v) => height - ((v - min) / range) * height;
  const x = (i) => (i / (values.length - 1)) * plotW;

  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const bandTop = y(hi);
  const bandBottom = y(lo);
  const targetY = y(target);
  const axisX = plotW + 8; // where the vertical band bar sits

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* normal band shading across the plot */}
      <rect x={0} y={bandTop} width={plotW} height={Math.max(0, bandBottom - bandTop)} fill="#00c895" opacity="0.08" />
      {/* target setpoint (dashed) */}
      <line x1={0} y1={targetY} x2={plotW} y2={targetY} stroke="#04121f" strokeOpacity="0.28" strokeDasharray="3 3" strokeWidth="1" />
      {/* series */}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* latest point */}
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2" fill={color} />

      {/* ── vertical band-limit axis: a bar from lo to hi with end caps ── */}
      <line x1={axisX} y1={bandTop} x2={axisX} y2={bandBottom} stroke="#00c895" strokeOpacity="0.7" strokeWidth="2" />
      {/* hi cap + label */}
      <line x1={axisX - 3} y1={bandTop} x2={axisX + 3} y2={bandTop} stroke="#00c895" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x={axisX + 5} y={bandTop + 3} fill="#04121f" fillOpacity="0.55" fontSize="7" fontFamily="monospace">{hi}</text>
      {/* lo cap + label */}
      <line x1={axisX - 3} y1={bandBottom} x2={axisX + 3} y2={bandBottom} stroke="#00c895" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x={axisX + 5} y={bandBottom + 3} fill="#04121f" fillOpacity="0.55" fontSize="7" fontFamily="monospace">{lo}</text>
    </svg>
  );
}

// ─── SENSOR CARD ────────────────────────────────────────────────────────
function SensorCard({ sensor }) {
  const tgt = SENSOR_TARGETS[sensor.sensorId] || { target: sensor.value, lo: -Infinity, hi: Infinity };
  const grade = gradeVsBand(sensor.value, tgt.lo, tgt.hi);
  const color = STATUS_COLORS[grade];

  return (
    <div className="border border-[#00c895]/28 bg-white p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="t-label font-mono text-[#04121f]/82">{sensor.sensorId}</span>
          <span className="t-label text-[#04121f]/60">{sensor.location}</span>
        </div>
        <span className="t-label font-mono uppercase px-1.5 py-0.5" style={{ color, border: `1px solid ${color}55` }}>
          {grade === 'good' ? 'normal' : grade === 'warn' ? 'watch' : 'alarm'}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono" style={{ color }}>
          {typeof sensor.value === 'number' ? sensor.value.toFixed(1) : sensor.value}
        </span>
        <span className="t-label font-mono text-[#04121f]/68">{sensor.unit}</span>
        <span className="t-label font-mono text-[#04121f]/56 ml-auto">
          sp {tgt.target}{sensor.unit}
        </span>
      </div>
      <TimeSeriesPlot values={sensor.history} target={tgt.target} lo={tgt.lo} hi={tgt.hi} color={color} width={176} height={44} />
      <div className="flex items-center gap-1.5 t-label font-mono text-[#04121f]/52">
        <span className="inline-block w-0.5 h-3 bg-[#00c895]/70" />
        <span className="text-[#04121f]/60">normal band {tgt.lo}–{tgt.hi}{sensor.unit}</span>
      </div>
    </div>
  );
}

// ─── CONVEYOR METRICS ───────────────────────────────────────────────────
function ConveyorMetrics({ speed, itemsInTransit, itemsProcessed }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Metric label="Belt Speed" value={speed.toFixed(2)} unit="m/s" />
      <Metric label="In Transit" value={itemsInTransit} unit="pcs" />
      <Metric label="Throughput" value={itemsProcessed.toLocaleString()} unit="today" />
    </div>
  );
}
function Metric({ label, value, unit }) {
  return (
    <div className="border border-[#00c895]/28 bg-white px-3 py-2">
      <div className="t-label text-[#04121f]/68 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-2xl font-mono text-[#04121f]">{value}</span>
        <span className="t-label font-mono text-[#04121f]/68">{unit}</span>
      </div>
    </div>
  );
}

// ─── MAIN TAB ───────────────────────────────────────────────────────────
export default function ScadaTab() {
  const events = useSubscription(SCADA_PREFIX, 120);
  const publish = usePublish();

  const [alarms, setAlarms] = useState([]);
  const [sensors, setSensors] = useState(seedSensors);
  const [conveyorSpeed, setConveyorSpeed] = useState(1.2);
  const [itemsInTransit, setItemsInTransit] = useState(3);
  const [itemsProcessed, setItemsProcessed] = useState(2847);

  // Process the newest event (payload lives under event.payload).
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    const p = latest.payload || {};
    const { topic } = latest;

    if (topic?.includes('sensor/reading') && p.sensorId) {
      setSensors((prev) => {
        const existing = prev[p.sensorId] || {
          sensorId: p.sensorId, type: p.type, value: p.value, unit: p.unit, location: p.location, history: [],
        };
        const history = [...existing.history, p.value].slice(-MAX_POINTS);
        return { ...prev, [p.sensorId]: { ...existing, value: p.value, unit: p.unit || existing.unit, location: p.location || existing.location, history } };
      });
    }

    if (topic?.includes('alarm/raised')) {
      setAlarms((prev) => [{ ...p, timestamp: latest.timestamp }, ...prev].slice(0, 6));
    }
    if (topic?.includes('alarm/acknowledged')) {
      setAlarms((prev) => prev.filter((a) => a.alarmCode !== p.alarmCode));
    }
    if (topic?.includes('conveyor/status')) {
      if (p.speed !== undefined) setConveyorSpeed(p.speed);
      if (p.itemsInTransit !== undefined) setItemsInTransit(p.itemsInTransit);
      setItemsProcessed((n) => n + (p.itemsInTransit || 0));
    }
  }, [events]);

  const handleAcknowledge = useCallback((alarm) => {
    publish(SCADA.ALARM_ACKNOWLEDGED, {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'scada-operator',
      correlationId: null,
      payload: { alarmCode: alarm.alarmCode, acknowledgedAt: new Date().toISOString() },
    });
    setAlarms((prev) => prev.filter((a) => a.alarmCode !== alarm.alarmCode));
  }, [publish]);

  const sensorList = Object.values(sensors);

  return (
    <div className="h-full p-3 overflow-y-auto flex flex-col gap-2.5 bg-[#ecfdf5]">
      <AlarmBanner alarms={alarms} onAcknowledge={handleAcknowledge} />

      <div className="grid grid-cols-3 gap-2.5">
        {sensorList.map((sensor) => (
          <SensorCard key={sensor.sensorId} sensor={sensor} />
        ))}
      </div>

      <ConveyorMetrics speed={conveyorSpeed} itemsInTransit={itemsInTransit} itemsProcessed={itemsProcessed} />

      <div className="flex items-center gap-2 px-1">
        <div className="w-1.5 h-1.5 bg-[#00c895] animate-live" />
        <span className="t-label font-mono text-[#04121f]/68">LIVE — {events.length} SCADA events captured</span>
      </div>
    </div>
  );
}
