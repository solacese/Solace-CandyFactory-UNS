import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { ARM, WILDCARDS } from '../../constants/topics.js';

// ─── Constants ──────────────────────────────────────────────────
const JOINT_NAMES = ['Base', 'Shoulder', 'Elbow', 'Wrist-P', 'Wrist-R', 'Gripper'];
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
        message: getLogMessage(shortTopic, data.payload),
      };
      return [entry, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
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
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden bg-[#0a0a0a]">
      {/* E-STOP */}
      <button
        onClick={handleEStop}
        className="w-full py-2 bg-white text-black font-bold text-xs uppercase tracking-widest
          border border-white hover:bg-white/90 active:bg-white/70 transition-colors"
      >
        E-STOP
      </button>

      {/* Main content: Arm viz + Telemetry */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left: 2D Robot Arm */}
        <div className="flex-1 border border-white/10 bg-[#111111] p-3 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Robot Arm</span>
            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${
              armStatus.status === 'executing' ? 'border-[#00C895] text-[#00C895]' : 'border-white/20 text-white/40'
            }`}>
              {armStatus.status || 'idle'}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <ArmVisualization angles={jointAngles} gripperState={gripperState} activeStatus={armStatus.status} />
          </div>
        </div>

        {/* Right: Joint Telemetry */}
        <div className="w-64 border border-white/10 bg-[#111111] p-3 flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Joint Telemetry</span>
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
        <HitlPanel
          request={hitlRequest}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Command Log */}
      <div className="h-32 border border-white/10 bg-[#111111] flex flex-col overflow-hidden">
        <div className="px-3 py-1 border-b border-white/10 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-[#00C895] animate-pulse" />
          <span className="text-[10px] text-white/40 uppercase tracking-wider">Command Log</span>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-1">
          {commandLog.map((entry) => (
            <div key={entry.id} className="py-0.5 flex gap-2 items-start font-mono text-[11px]">
              <span className="text-white/30 shrink-0">{entry.time}</span>
              <span className="text-white/50 shrink-0">{entry.topic}</span>
              <span className="text-white break-all">{entry.message}</span>
            </div>
          ))}
          {commandLog.length === 0 && (
            <span className="text-[11px] font-mono text-white/20">Awaiting arm events...</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function JointBar({ name, angle, isGripper, gripperState }) {
  const displayValue = isGripper
    ? gripperState
    : `${angle.toFixed(1)}°`;
  const normalizedValue = isGripper
    ? (gripperState === 'closed' ? 85 : 10)
    : ((angle + 90) / 180) * 100;
  const barWidth = Math.max(2, Math.min(100, normalizedValue));

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-mono text-white/40">{name}</span>
        <span className="text-[10px] font-mono text-white">{displayValue}</span>
      </div>
      <div className="h-1.5 bg-white/10 overflow-hidden">
        <div
          className="h-full bg-white transition-all duration-200"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function ArmVisualization({ angles, gripperState, activeStatus }) {
  const [base, shoulder, elbow, wristPitch, wristRoll] = angles;
  const isActive = activeStatus === 'executing';

  return (
    <svg viewBox="0 0 300 300" className="w-full h-full max-w-[260px] max-h-[260px]">
      {/* Background grid */}
      <defs>
        <pattern id="armgrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="300" height="300" fill="url(#armgrid)" />

      {/* Base platform */}
      <rect x="115" y="270" width="70" height="20" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="130" y="265" width="40" height="8" fill="none" stroke="white" strokeWidth="1" />

      {/* Arm assembly */}
      <g transform="translate(150, 268)">
        <g transform={`rotate(${base})`}>
          {/* Base joint */}
          <circle cx="0" cy="0" r="6" fill="none" stroke="white" strokeWidth="1.5" />

          {/* Segment 1: Upper arm */}
          <g transform={`rotate(${shoulder})`}>
            <line x1="0" y1="0" x2="0" y2="-70" stroke={isActive ? '#00C895' : 'white'} strokeWidth="2" />
            <circle cx="0" cy="0" r="4" fill="none" stroke="white" strokeWidth="1.5" />

            {/* Segment 2: Forearm */}
            <g transform="translate(0, -70)">
              <g transform={`rotate(${elbow})`}>
                <line x1="0" y1="0" x2="0" y2="-55" stroke="white" strokeWidth="2" />
                <circle cx="0" cy="0" r="3.5" fill="none" stroke="white" strokeWidth="1.5" />

                {/* Segment 3: Wrist */}
                <g transform="translate(0, -55)">
                  <g transform={`rotate(${wristPitch})`}>
                    <line x1="0" y1="0" x2="0" y2="-30" stroke="white" strokeWidth="1.5" />
                    <circle cx="0" cy="0" r="3" fill="none" stroke="white" strokeWidth="1" />

                    {/* Segment 4: Gripper */}
                    <g transform={`translate(0, -30) rotate(${wristRoll})`}>
                      <circle cx="0" cy="0" r="2.5" fill="none" stroke="white" strokeWidth="1" />
                      <GripperSVG state={gripperState} />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>

      {/* Live indicator */}
      {isActive && (
        <rect x="10" y="10" width="6" height="6" fill="#00C895">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  );
}

function GripperSVG({ state }) {
  const openAngle = state === 'closed' ? 5 : 25;
  return (
    <g>
      {/* Left finger */}
      <g transform={`rotate(${-openAngle})`}>
        <line x1="0" y1="0" x2="0" y2="-16" stroke="white" strokeWidth="1.5" />
      </g>
      {/* Right finger */}
      <g transform={`rotate(${openAngle})`}>
        <line x1="0" y1="0" x2="0" y2="-16" stroke="white" strokeWidth="1.5" />
      </g>
    </g>
  );
}

function HitlPanel({ request, onApprove, onReject }) {
  const action = request.payload?.action || 'Unknown motion';
  const reason = request.payload?.reason || '';

  return (
    <div className="border border-white/10 bg-[#111111] p-3 flex items-center gap-3">
      <div className="flex-1">
        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Approval Required</div>
        <p className="text-sm font-mono text-white">{action}</p>
        {reason && <p className="text-[11px] font-mono text-white/50 mt-0.5">{reason}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onApprove}
          className="px-4 py-1.5 bg-[#00C895] text-black font-bold text-xs uppercase tracking-wider
            hover:bg-[#00C895]/90 active:bg-[#00C895]/70 transition-colors"
        >
          APPROVE
        </button>
        <button
          onClick={onReject}
          className="px-4 py-1.5 border border-white/30 text-white font-bold text-xs uppercase tracking-wider
            hover:bg-white/10 active:bg-white/5 transition-colors"
        >
          REJECT
        </button>
      </div>
    </div>
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
