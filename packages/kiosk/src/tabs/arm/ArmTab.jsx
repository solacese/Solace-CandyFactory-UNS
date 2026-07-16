import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { ARM, WILDCARDS } from '../../constants/topics.js';

// ─── Constants ──────────────────────────────────────────────────

const JOINT_NAMES = ['Base', 'Shoulder', 'Elbow', 'Wrist Pitch', 'Wrist Roll', 'Gripper'];
const DEFAULT_ANGLES = [0, -30, 45, 0, 0, 0];
const MAX_LOG_ENTRIES = 40;

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
  const logRef = useRef(null);

  // Process arm events
  useEffect(() => {
    if (armEvents.length === 0) return;
    const latest = armEvents[0];
    const topic = latest.topic;

    if (topic === ARM.TELEMETRY && latest.payload) {
      if (latest.payload.jointAngles) setJointAngles(latest.payload.jointAngles);
      if (latest.payload.gripperState) setGripperState(latest.payload.gripperState);
    } else if (topic === ARM.STATUS && latest.payload) {
      setArmStatus(latest.payload);
    }

    // Add to command log
    addLogEntry(topic, latest);
  }, [armEvents.length]);

  // Process HITL events
  useEffect(() => {
    if (hitlEvents.length === 0) return;
    const latest = hitlEvents[0];

    if (latest.topic === ARM.HITL_REQUIRED) {
      setHitlRequest(latest);
    } else if (latest.topic === ARM.HITL_APPROVED) {
      setHitlRequest(null);
    }

    addLogEntry(latest.topic, latest);
  }, [hitlEvents.length]);

  const addLogEntry = useCallback((topic, data) => {
    setCommandLog((prev) => {
      const shortTopic = topic.replace('haribot/paris-demo/packing/line1/', '');
      const entry = {
        id: data.eventId || crypto.randomUUID(),
        time: new Date(data.timestamp || Date.now()).toLocaleTimeString('en-GB', { hour12: false }),
        topic: shortTopic,
        source: data.source || 'unknown',
        message: getLogMessage(shortTopic, data.payload),
      };
      return [entry, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [commandLog.length]);

  // E-STOP handler
  const handleEStop = useCallback(() => {
    publish(ARM.COMMAND, {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'kiosk-operator',
      correlationId: null,
      payload: { commandType: 'stop' },
    });
  }, [publish]);

  // HITL approve/reject
  const handleApprove = useCallback(() => {
    if (!hitlRequest) return;
    publish(ARM.HITL_APPROVED, {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'kiosk-operator',
      correlationId: hitlRequest.correlationId,
      payload: { approved: true, operator: 'kiosk-user' },
    });
    setHitlRequest(null);
  }, [publish, hitlRequest]);

  const handleReject = useCallback(() => {
    if (!hitlRequest) return;
    publish(ARM.HITL_APPROVED, {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'kiosk-operator',
      correlationId: hitlRequest.correlationId,
      payload: { approved: false, operator: 'kiosk-user' },
    });
    setHitlRequest(null);
  }, [publish, hitlRequest]);

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
      {/* E-STOP */}
      <button
        onClick={handleEStop}
        className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-lg rounded-lg
          border-2 border-red-400 shadow-lg shadow-red-900/40 transition-all uppercase tracking-widest
          active:scale-[0.98]"
      >
        E-STOP
      </button>

      {/* Main content: Arm viz + Telemetry */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: 2D Robot Arm */}
        <div className="flex-1 bg-white/5 rounded-lg border border-white/10 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider">Robot Arm</h3>
            <StatusBadge status={armStatus.status} />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <ArmVisualization angles={jointAngles} gripperState={gripperState} />
          </div>
        </div>

        {/* Right: Joint Telemetry */}
        <div className="w-72 bg-white/5 rounded-lg border border-white/10 p-4 flex flex-col">
          <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Joint Telemetry</h3>
          <div className="flex flex-col gap-2.5 flex-1">
            {JOINT_NAMES.map((name, i) => (
              <JointGauge
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
        <HitlPanel
          request={hitlRequest}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Command Log */}
      <div className="h-36 bg-black/40 rounded-lg border border-white/10 flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 border-b border-white/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Command Log</span>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-1 font-mono text-[11px]">
          {commandLog.map((entry) => (
            <div key={entry.id} className="py-0.5 flex gap-2 items-start">
              <span className="text-white/30 shrink-0">{entry.time}</span>
              <SourceTag source={entry.source} />
              <span className="text-white/70 break-all">{entry.message}</span>
            </div>
          ))}
          {commandLog.length === 0 && (
            <span className="text-white/20 italic">Waiting for arm events...</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    idle: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    executing: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    fault: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${styles[status] || styles.idle}`}>
      {status || 'idle'}
    </span>
  );
}

function JointGauge({ name, angle, isGripper, gripperState }) {
  // For gripper, show open/closed instead of angle
  const displayValue = isGripper
    ? gripperState === 'closed' ? 85 : 10
    : angle;
  const normalizedValue = isGripper
    ? (gripperState === 'closed' ? 85 : 10)
    : ((angle + 90) / 180) * 100; // Map -90..90 to 0..100
  const barWidth = Math.max(2, Math.min(100, normalizedValue));

  const barColor = isGripper
    ? gripperState === 'closed' ? 'bg-emerald-400' : 'bg-sky-400'
    : Math.abs(angle) > 70 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-white/50 font-medium">{name}</span>
        <span className="text-[10px] text-white/80 font-mono">
          {isGripper ? gripperState : `${angle.toFixed(1)}°`}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function ArmVisualization({ angles, gripperState }) {
  const [base, shoulder, elbow, wristPitch, wristRoll, gripper] = angles;

  // SVG arm with articulated joints — each segment rotates based on angle
  // Coordinate system: SVG 300x300, arm base at bottom-center
  return (
    <svg viewBox="0 0 300 300" className="w-full h-full max-w-[280px] max-h-[280px]">
      {/* Background grid */}
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="300" height="300" fill="url(#grid)" />

      {/* Base platform */}
      <rect x="115" y="270" width="70" height="20" rx="4" fill="#374151" stroke="#6B7280" strokeWidth="1" />
      <rect x="130" y="265" width="40" height="8" rx="2" fill="#4B5563" />

      {/* Arm assembly — nested transforms */}
      <g transform={`translate(150, 268)`}>
        {/* Base rotation */}
        <g transform={`rotate(${base})`}>
          {/* Base joint indicator */}
          <circle cx="0" cy="0" r="8" fill="#1F2937" stroke="#10B981" strokeWidth="1.5" />

          {/* Segment 1: Base to Shoulder */}
          <g transform="translate(0, 0)">
            <g transform={`rotate(${shoulder})`}>
              {/* Upper arm */}
              <rect x="-6" y="-70" width="12" height="70" rx="4" fill="#1E40AF" stroke="#3B82F6" strokeWidth="1" />
              <circle cx="0" cy="0" r="6" fill="#1F2937" stroke="#10B981" strokeWidth="1.5" />

              {/* Segment 2: Shoulder to Elbow */}
              <g transform="translate(0, -70)">
                <g transform={`rotate(${elbow})`}>
                  {/* Forearm */}
                  <rect x="-5" y="-55" width="10" height="55" rx="3" fill="#1E3A5F" stroke="#60A5FA" strokeWidth="1" />
                  <circle cx="0" cy="0" r="5" fill="#1F2937" stroke="#10B981" strokeWidth="1.5" />

                  {/* Segment 3: Elbow to Wrist */}
                  <g transform="translate(0, -55)">
                    <g transform={`rotate(${wristPitch})`}>
                      {/* Wrist */}
                      <rect x="-4" y="-30" width="8" height="30" rx="2" fill="#1E3A5F" stroke="#818CF8" strokeWidth="1" />
                      <circle cx="0" cy="0" r="4" fill="#1F2937" stroke="#10B981" strokeWidth="1.5" />

                      {/* Segment 4: Wrist Roll + Gripper */}
                      <g transform="translate(0, -30)">
                        <g transform={`rotate(${wristRoll})`}>
                          <circle cx="0" cy="0" r="3.5" fill="#1F2937" stroke="#A78BFA" strokeWidth="1" />

                          {/* Gripper */}
                          <GripperSVG state={gripperState} />
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>

      {/* Status indicator */}
      <circle cx="20" cy="20" r="5" fill="#10B981" opacity="0.8">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function GripperSVG({ state }) {
  const openAngle = state === 'closed' ? 5 : 25;
  return (
    <g>
      {/* Left finger */}
      <g transform={`rotate(${-openAngle})`}>
        <rect x="-2" y="-18" width="4" height="18" rx="2" fill="#374151" stroke="#F59E0B" strokeWidth="0.8" />
      </g>
      {/* Right finger */}
      <g transform={`rotate(${openAngle})`}>
        <rect x="-2" y="-18" width="4" height="18" rx="2" fill="#374151" stroke="#F59E0B" strokeWidth="0.8" />
      </g>
    </g>
  );
}

function HitlPanel({ request, onApprove, onReject }) {
  const action = request.payload?.action || 'Unknown motion';
  const reason = request.payload?.reason || '';

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 flex items-center gap-4 animate-pulse-slow">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-amber-400 text-lg">&#9888;</span>
          <h4 className="text-sm font-bold text-amber-300 uppercase">Operator Approval Required</h4>
        </div>
        <p className="text-sm text-white/80 font-medium">{action}</p>
        {reason && <p className="text-xs text-white/50 mt-0.5">{reason}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onApprove}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm rounded-lg
            border border-emerald-400/50 shadow-lg transition-all active:scale-95"
        >
          APPROVE MOTION
        </button>
        <button
          onClick={onReject}
          className="px-4 py-2.5 bg-red-600/80 hover:bg-red-600 active:bg-red-700 text-white font-bold text-sm rounded-lg
            border border-red-400/50 transition-all active:scale-95"
        >
          REJECT
        </button>
      </div>
    </div>
  );
}

function SourceTag({ source }) {
  const colors = {
    'sim-arm': 'text-emerald-400 bg-emerald-500/15',
    'sim-mes': 'text-amber-400 bg-amber-500/15',
    'sim-erp': 'text-purple-400 bg-purple-500/15',
    'sim-scada': 'text-red-400 bg-red-500/15',
    'kiosk-operator': 'text-sky-400 bg-sky-500/15',
  };
  const cls = colors[source] || 'text-white/40 bg-white/5';
  const label = source?.replace('sim-', '') || '?';

  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0 rounded shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function getLogMessage(topic, payload) {
  if (!payload) return topic;

  if (topic.includes('arm/command')) {
    return `CMD: ${payload.commandType} → ${payload.params?.target || ''}`;
  }
  if (topic.includes('arm/telemetry')) {
    const angles = payload.jointAngles;
    return `Joints: [${angles?.map((a) => a.toFixed(0)).join(', ') || '?'}] grip:${payload.gripperState}`;
  }
  if (topic.includes('arm/status')) {
    return `Status: ${payload.status} — ${payload.detail || ''}`;
  }
  if (topic.includes('hitl/approval-required')) {
    return `HITL REQ: ${payload.action || 'approval needed'}`;
  }
  if (topic.includes('hitl/approved')) {
    return `HITL: ${payload.approved ? 'APPROVED' : 'REJECTED'} by ${payload.operator}`;
  }
  return JSON.stringify(payload).slice(0, 80);
}
