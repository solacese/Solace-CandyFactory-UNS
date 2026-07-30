import { useState, useEffect, useCallback } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { WILDCARDS, SCADA } from '../../constants/topics.js';

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const SCADA_PREFIX = WILDCARDS.SCADA;
const MAX_SPARKLINE_POINTS = 20;

// ─── ALARM BANNER ───────────────────────────────────────────────────────
function AlarmBanner({ alarms, onAcknowledge }) {
  if (alarms.length === 0) return null;

  return (
    <div className="border border-[#ec4899]/10 border-l-2 border-l-white bg-[#ffffff] px-3 py-2">
      {alarms.map((alarm, i) => (
        <div key={i} className="flex items-center gap-3 t-label font-mono py-0.5">
          <span className="text-[#3b1f33] font-bold">[ALARM]</span>
          <span className="text-[#3b1f33]/80 flex-1 truncate">{alarm.message}</span>
          <span className="text-[#3b1f33]/30">
            {alarm.timestamp ? new Date(alarm.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : ''}
          </span>
          <button
            onClick={() => onAcknowledge(alarm)}
            className="px-2 py-0.5 t-label uppercase border border-[#ec4899]/30 text-[#3b1f33] hover:bg-[#ec4899]/10 transition-colors"
          >
            ACK
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── SPARKLINE ──────────────────────────────────────────────────────────
function Sparkline({ values, width = 100, height = 24 }) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── SENSOR CARD ────────────────────────────────────────────────────────
function SensorCard({ sensorId, value, unit, status, history }) {
  return (
    <div className="border border-[#ec4899]/10 bg-[#ffffff] p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="t-label font-mono text-[#3b1f33]/40">{sensorId}</span>
        <span className={`t-label font-mono uppercase px-1 border ${
          status === 'normal' ? 'border-[#ec4899]/10 text-[#3b1f33]/40' :
          status === 'warning' ? 'border-[#ec4899]/30 text-[#3b1f33]/70' :
          'border-[#ec4899] text-[#3b1f33]'
        }`}>
          {status}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono text-[#3b1f33]">{typeof value === 'number' ? value.toFixed(1) : value}</span>
        <span className="t-label font-mono text-[#3b1f33]/30">{unit}</span>
      </div>
      <Sparkline values={history} width={120} height={20} />
    </div>
  );
}

// ─── PROCESS FLOW (TEXT) ────────────────────────────────────────────────
function ProcessFlow({ processValues }) {
  const stages = [
    { id: 'hopper', label: 'HOPPER' },
    { id: 'conveyorA', label: 'CONV-A' },
    { id: 'pickZone', label: 'PICK' },
    { id: 'conveyorB', label: 'CONV-B' },
    { id: 'packing', label: 'PACK' },
  ];

  return (
    <div className="border border-[#ec4899]/10 bg-[#ffffff] p-3">
      <div className="t-label text-[#3b1f33]/40 uppercase tracking-wider mb-2">Process Flow</div>
      <div className="flex items-center justify-between font-mono t-label">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <span className="text-[#3b1f33]/70">{stage.label}</span>
              <span className="t-label text-[#3b1f33]/30 mt-0.5">{processValues[stage.id] || '—'}</span>
            </div>
            {i < stages.length - 1 && (
              <span className="text-[#3b1f33]/20 mx-2">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CONVEYOR METRICS ───────────────────────────────────────────────────
function ConveyorMetrics({ speed, itemsInTransit, itemsProcessed }) {
  return (
    <div className="flex gap-0">
      <div className="flex-1 border border-[#ec4899]/10 px-3 py-2">
        <div className="t-label text-[#3b1f33]/30 uppercase tracking-wider">Speed</div>
        <span className="text-2xl font-mono text-[#3b1f33]">{speed.toFixed(1)}</span>
        <span className="t-label font-mono text-[#3b1f33]/30 ml-1">m/s</span>
      </div>
      <div className="flex-1 border border-[#ec4899]/10 px-3 py-2">
        <div className="t-label text-[#3b1f33]/30 uppercase tracking-wider">In Transit</div>
        <span className="text-2xl font-mono text-[#3b1f33]">{itemsInTransit}</span>
      </div>
      <div className="flex-1 border border-[#ec4899]/10 px-3 py-2">
        <div className="t-label text-[#3b1f33]/30 uppercase tracking-wider">Throughput</div>
        <span className="text-2xl font-mono text-[#3b1f33]">{itemsProcessed.toLocaleString()}</span>
        <span className="t-label font-mono text-[#3b1f33]/30 ml-1">today</span>
      </div>
    </div>
  );
}

// ─── MAIN TAB ───────────────────────────────────────────────────────────
export default function ScadaTab() {
  const events = useSubscription(SCADA_PREFIX);
  const publish = usePublish();

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
    hopper: '85%',
    conveyorA: '1.2 m/s',
    pickZone: '72.4°C',
    conveyorB: '1.2 m/s',
    packing: '142 u/hr',
  });

  // Process events
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

  // ACK handler
  const handleAcknowledge = useCallback((alarm) => {
    publish(SCADA.ALARM_ACKNOWLEDGED, {
      alarmCode: alarm.alarmCode,
      acknowledgedAt: new Date().toISOString(),
    });
    setAlarms((prev) => prev.filter((a) => a.alarmCode !== alarm.alarmCode));
  }, [publish]);

  const sensorList = Object.values(sensors);

  return (
    <div className="h-full p-3 overflow-y-auto flex flex-col gap-2 bg-[#fdf2f8]">
      {/* Alarm Banner */}
      <AlarmBanner alarms={alarms} onAcknowledge={handleAcknowledge} />

      {/* Sensor Grid */}
      <div className="grid grid-cols-3 gap-2">
        {sensorList.slice(0, 6).map((sensor) => (
          <SensorCard key={sensor.sensorId} {...sensor} />
        ))}
      </div>

      {/* Process Flow */}
      <ProcessFlow processValues={processValues} />

      {/* Conveyor Metrics */}
      <ConveyorMetrics speed={conveyorSpeed} itemsInTransit={itemsInTransit} itemsProcessed={itemsProcessed} />

      {/* Live indicator */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-1.5 h-1.5 bg-[#ec4899] animate-pulse" />
        <span className="t-label font-mono text-[#3b1f33]/30">LIVE — {events.length} events captured</span>
      </div>
    </div>
  );
}
