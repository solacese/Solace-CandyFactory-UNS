import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { ARM } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';
import Arm3D from './Arm3D.jsx';

// ─── Constants ──────────────────────────────────────────────────
const JOINT_NAMES = ['Base', 'Shoulder', 'Elbow', 'Wrist-P', 'Wrist-R', 'Gripper'];
const DEFAULT_ANGLES = [0, -30, 45, 0, 0, 0];
const MAX_LOG_ENTRIES = 40;
const BIN_COLORS = SWEETS.map((s) => s.color); // index 0..3 → bin 1..4
const ACCENT = '#db2777';
const INK = '#2a0f22';

// ─── Main Component ─────────────────────────────────────────────
export default function ArmTab() {
  const armEvents = useSubscription('haribot/paris-demo/packing/line1/arm/');
  const hitlEvents = useSubscription('haribot/paris-demo/packing/line1/hitl/');
  const publish = usePublish();

  const [jointAngles, setJointAngles] = useState(DEFAULT_ANGLES);
  const [gripperState, setGripperState] = useState('open');
  const [armStatus, setArmStatus] = useState({ status: 'idle', detail: '' });
  const [hitlRequest, setHitlRequest] = useState(null);
  const [commandLog, setCommandLog] = useState([]);
  const [currentUnit, setCurrentUnit] = useState(null); // { itemId, unitIndex, totalUnits, sweetType }
  const [heldColor, setHeldColor] = useState(null);
  const logRef = useRef(null);

  // Process arm events
  useEffect(() => {
    if (armEvents.length === 0) return;
    const latest = armEvents[0];
    const topic = latest.topic;
    const p = latest.payload || {};

    if (topic === ARM.TELEMETRY) {
      if (p.jointAngles) setJointAngles(p.jointAngles);
      if (p.gripperState) setGripperState(p.gripperState);
    } else if (topic === ARM.STATUS) {
      setArmStatus(p);
      if (p.status === 'idle') setHeldColor(null);
    } else if (topic === ARM.COMMAND) {
      // A new per-unit pick command — track which unit the arm is handling
      if (p.itemId || p.unitIndex) {
        setCurrentUnit({
          itemId: p.itemId,
          unitIndex: p.unitIndex,
          totalUnits: p.totalUnits,
          sweetType: p.sweetType,
        });
      }
      const sweet = SWEETS.find((s) => s.id === p.sweetType);
      if (sweet) setHeldColor(sweet.color);
    }

    addLogEntry(topic, latest);
  }, [armEvents.length]);

  // Process HITL events
  useEffect(() => {
    if (hitlEvents.length === 0) return;
    const latest = hitlEvents[0];
    if (latest.topic === ARM.HITL_REQUIRED) setHitlRequest(latest);
    else if (latest.topic === ARM.HITL_APPROVED) setHitlRequest(null);
    addLogEntry(latest.topic, latest);
  }, [hitlEvents.length]);

  const addLogEntry = useCallback((topic, data) => {
    setCommandLog((prev) => {
      const shortTopic = topic.replace('haribot/paris-demo/packing/line1/', '');
      const entry = {
        id: data.eventId || crypto.randomUUID(),
        time: new Date(data.timestamp || Date.now()).toLocaleTimeString('en-GB', { hour12: false }),
        topic: shortTopic,
        message: getLogMessage(shortTopic, data.payload),
      };
      return [entry, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [commandLog.length]);

  const handleEStop = useCallback(() => {
    publish(ARM.COMMAND, {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'kiosk-operator',
      correlationId: null,
      payload: { commandType: 'stop' },
    });
  }, [publish]);

  const respondHitl = useCallback((approved) => {
    if (!hitlRequest) return;
    publish(ARM.HITL_APPROVED, {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'kiosk-operator',
      correlationId: hitlRequest.correlationId,
      payload: { approved, operator: 'kiosk-user' },
    });
    setHitlRequest(null);
  }, [publish, hitlRequest]);

  const isActive = armStatus.status === 'executing';

  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden bg-[#fdf2f8]">
      {/* E-STOP */}
      <button
        onClick={handleEStop}
        className="w-full py-2 bg-[#f43f5e] text-white t-label font-semibold uppercase tracking-widest
          hover:opacity-90 active:opacity-75 transition-opacity shadow-sm"
      >
        E-STOP
      </button>

      {/* Main content: 3D arm + Telemetry */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left: 3D Robot Arm */}
        <div className="flex-1 rounded-card border border-[#db2777]/34 bg-white overflow-hidden flex flex-col shadow-sm">
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="t-label uppercase text-[#2a0f22]/70 tracking-wider">Robot Arm · 3D</span>
            <span className={`t-label font-mono uppercase px-2 py-0.5 pill border ${
              isActive ? 'border-[#db2777] text-[#db2777] bg-[#db2777]/8' : 'border-[#2a0f22]/45 text-[#2a0f22]/65'
            }`}>
              {armStatus.status || 'idle'}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense fallback={<Loading />}>
              <Arm3D
                angles={jointAngles}
                gripperState={gripperState}
                active={isActive}
                binColors={BIN_COLORS}
                heldColor={heldColor}
              />
            </Suspense>
          </div>
          {/* Per-unit transaction banner */}
          <UnitBanner unit={currentUnit} status={armStatus.status} />
        </div>

        {/* Right: Joint Telemetry */}
        <div className="w-60 rounded-card border border-[#db2777]/34 bg-white p-3 flex flex-col shadow-sm">
          <span className="t-label uppercase text-[#2a0f22]/70 tracking-wider mb-2">Joint Telemetry</span>
          <div className="flex flex-col gap-2 flex-1">
            {JOINT_NAMES.map((name, i) => (
              <JointBar
                key={name}
                name={name}
                angle={jointAngles[i] || 0}
                isGripper={i === 5}
                gripperState={gripperState}
              />
            ))}
          </div>
        </div>
      </div>

      {/* HITL Approval Panel */}
      {hitlRequest && (
        <HitlPanel request={hitlRequest} onApprove={() => respondHitl(true)} onReject={() => respondHitl(false)} />
      )}

      {/* Command Log */}
      <div className="h-32 rounded-card border border-[#db2777]/34 bg-white flex flex-col overflow-hidden shadow-sm">
        <div className="px-3 py-1.5 border-b border-[#db2777]/28 flex items-center gap-2">
          <div className="w-1.5 h-1.5 pill bg-[#db2777] animate-live" />
          <span className="t-label uppercase text-[#2a0f22]/70 tracking-wider">Command Log</span>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-1">
          {commandLog.map((entry) => (
            <div key={entry.id} className="py-0.5 flex gap-2 items-start font-mono t-label">
              <span className="text-[#2a0f22]/60 shrink-0">{entry.time}</span>
              <span className="text-[#db2777]/70 shrink-0">{entry.topic}</span>
              <span className="text-[#2a0f22]/90 break-all">{entry.message}</span>
            </div>
          ))}
          {commandLog.length === 0 && (
            <span className="t-label font-mono text-[#2a0f22]/50">Awaiting arm events…</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Loading() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <span className="t-label font-mono text-[#2a0f22]/55 animate-live">Loading 3D scene…</span>
    </div>
  );
}

function UnitBanner({ unit, status }) {
  if (!unit) return null;
  const sweet = SWEETS.find((s) => s.id === unit.sweetType);
  return (
    <div className="px-3 py-2 border-t border-[#db2777]/28 flex items-center gap-3">
      <span className="text-lg">{sweet?.emoji || '🍬'}</span>
      <div className="flex flex-col leading-tight">
        <span className="t-data font-mono text-[#2a0f22]">{unit.itemId}</span>
        <span className="t-label text-[#2a0f22]/70">
          Unit {unit.unitIndex}/{unit.totalUnits} · {sweet?.name || unit.sweetType}
        </span>
      </div>
      <span className={`ml-auto t-label font-mono uppercase px-2 py-0.5 pill ${
        status === 'executing' ? 'text-[#db2777] bg-[#db2777]/8' : 'text-[#2a0f22]/65 bg-[#2a0f22]/5'
      }`}>
        {status === 'executing' ? 'picking' : 'placed'}
      </span>
    </div>
  );
}

function JointBar({ name, angle, isGripper, gripperState }) {
  const displayValue = isGripper ? gripperState : `${angle.toFixed(1)}°`;
  const normalizedValue = isGripper
    ? (gripperState === 'closed' ? 85 : 10)
    : ((angle + 90) / 180) * 100;
  const barWidth = Math.max(2, Math.min(100, normalizedValue));

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center">
        <span className="t-label font-mono text-[#2a0f22]/70">{name}</span>
        <span className="t-label font-mono text-[#2a0f22]">{displayValue}</span>
      </div>
      <div className="h-1.5 pill bg-[#db2777]/10 overflow-hidden">
        <div
          className="h-full pill bg-gradient-to-r from-[#f472b6] to-[#db2777] transition-all duration-200"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function HitlPanel({ request, onApprove, onReject }) {
  const action = request.payload?.action || 'Unknown motion';
  const reason = request.payload?.reason || '';

  return (
    <div className="rounded-card border border-[#db2777]/48 bg-[#db2777]/5 p-3 flex items-center gap-3 shadow-sm">
      <div className="flex-1">
        <div className="t-label uppercase text-[#db2777] tracking-wider mb-0.5">Approval Required</div>
        <p className="t-data font-mono text-[#2a0f22]">{action}</p>
        {reason && <p className="t-label font-mono text-[#2a0f22]/72 mt-0.5">{reason}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onApprove}
          className="px-4 py-1.5 pill bg-[#db2777] text-white font-semibold t-label uppercase tracking-wider
            hover:opacity-90 active:opacity-75 transition-opacity"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          className="px-4 py-1.5 pill border border-[#2a0f22]/50 text-[#2a0f22]/88 font-semibold t-label uppercase tracking-wider
            hover:bg-[#2a0f22]/5 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function getLogMessage(topic, payload) {
  if (!payload) return topic;
  const unit = payload.itemId ? `[${payload.itemId}] ` : '';

  if (topic.includes('arm/command')) {
    if (payload.commandType === 'stop') return 'CMD: STOP (E-STOP)';
    return `${unit}CMD: ${payload.commandType} → ${payload.params?.target || ''}`;
  }
  if (topic.includes('arm/telemetry')) {
    const angles = payload.jointAngles;
    return `${unit}Joints [${angles?.map((a) => a.toFixed(0)).join(', ') || '?'}] grip:${payload.gripperState}`;
  }
  if (topic.includes('arm/status')) {
    return `${unit}Status: ${payload.status} — ${payload.detail || ''}`;
  }
  if (topic.includes('hitl/approval-required')) {
    return `HITL REQ: ${payload.action || 'approval needed'}`;
  }
  if (topic.includes('hitl/approved')) {
    return `HITL: ${payload.approved ? 'APPROVED' : 'REJECTED'} by ${payload.operator}`;
  }
  return JSON.stringify(payload).slice(0, 80);
}
