import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { ARM, WILDCARDS, shortTopic as stripPrefix } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';

// Build-mode switch (defined in vite.config.js):
//   Pages / loopback build → embedded video of the real arm (no hardware, no WebGL).
//   Local / booth build     → live 3D arm driven by the telemetry stream.
// Arm3D (and its three.js dependency) is lazy-loaded, so it never enters the
// Pages bundle when the video branch is the one that renders.
const IS_LOOPBACK = typeof __LOOPBACK__ !== 'undefined' && __LOOPBACK__;
// Only wire up the WebGL arm when it can actually render. Guarding the dynamic
// import behind the compile-time flag lets Rollup drop the three.js chunk
// entirely from the Pages/loopback build.
const Arm3D = IS_LOOPBACK ? null : lazy(() => import('./Arm3D.jsx'));

// ─── Constants ──────────────────────────────────────────────────
const JOINT_NAMES = ['Base', 'Shoulder', 'Elbow', 'Wrist-P', 'Wrist-R', 'Gripper'];
const DEFAULT_ANGLES = [0, -30, 45, 0, 0, 0];
const MAX_LOG_ENTRIES = 40;
// If no real telemetry (source:"arm-bridge") arrives within this window, the
// view falls back to labelling itself SIM. Matches the engine's yield timeout.
const REAL_ARM_TIMEOUT_MS = 4000;
// Live SO-101 footage for the hardware-free Pages demo.
const ARM_VIDEO_ID = 'kCP5U_MXqCE';

// ─── Main Component ─────────────────────────────────────────────
export default function ArmTab() {
  const armEvents = useSubscription(WILDCARDS.ARM);
  const hitlEvents = useSubscription(WILDCARDS.HITL);
  const publish = usePublish();

  const [jointAngles, setJointAngles] = useState(DEFAULT_ANGLES);
  const [gripperState, setGripperState] = useState('open');
  const [armStatus, setArmStatus] = useState({ status: 'idle', detail: '' });
  const [hitlRequest, setHitlRequest] = useState(null);
  const [commandLog, setCommandLog] = useState([]);
  const [currentUnit, setCurrentUnit] = useState(null); // { itemId, unitIndex, totalUnits, sweetType }
  const [lastRealArmAt, setLastRealArmAt] = useState(0); // ts of last source:"arm-bridge" event
  const [now, setNow] = useState(Date.now());
  const logRef = useRef(null);

  // Tick so the LIVE→SIM badge flips back on its own when the arm goes quiet.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live when real hardware telemetry has arrived within the timeout window.
  const isLiveArm = now - lastRealArmAt < REAL_ARM_TIMEOUT_MS;

  // Process arm events
  useEffect(() => {
    if (armEvents.length === 0) return;
    const latest = armEvents[0];
    const topic = latest.topic;
    const p = latest.payload || {};

    // Real SO-101 telemetry is stamped source:"arm-bridge" — mark the view live.
    if (latest.source === 'arm-bridge') setLastRealArmAt(Date.now());

    if (topic === ARM.TELEMETRY) {
      if (p.jointAngles) setJointAngles(p.jointAngles);
      if (p.gripperState) setGripperState(p.gripperState);
    } else if (topic === ARM.STATUS) {
      setArmStatus(p);
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
    }

    addLogEntry(topic, latest);
    // Depend on the newest event's receive-time, not array length: the buffer
    // saturates at maxEvents and its .length stops changing, which would freeze
    // this effect and drop every subsequent event (incl. live arm-bridge data).
  }, [armEvents[0]?._receivedAt]);

  // Process HITL events
  useEffect(() => {
    if (hitlEvents.length === 0) return;
    const latest = hitlEvents[0];
    if (latest.topic === ARM.HITL_REQUIRED) setHitlRequest(latest);
    else if (latest.topic === ARM.HITL_APPROVED) setHitlRequest(null);
    addLogEntry(latest.topic, latest);
  }, [hitlEvents[0]?._receivedAt]);

  const addLogEntry = useCallback((topic, data) => {
    setCommandLog((prev) => {
      const shortTopic = stripPrefix(topic);
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
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden bg-[#ecfdf5]">
      {/* E-STOP */}
      <button
        onClick={handleEStop}
        className="w-full py-2 bg-[#fbbf24] text-white t-label font-semibold uppercase tracking-widest
          hover:opacity-90 active:opacity-75 transition-opacity shadow-sm"
      >
        E-STOP
      </button>

      {/* Main content: 3D arm + Telemetry */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left: Robot Arm feed (live video coming — visualization removed for now) */}
        <div className="flex-1 rounded-card border border-[#00c895]/34 bg-white overflow-hidden flex flex-col shadow-sm">
          <div className="flex items-center justify-between px-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="t-label uppercase text-[#04121f]/80 tracking-wider">Robot Arm</span>
              {/* LIVE = physical SO-101 telemetry; SIM = browser simulation. */}
              <span className={`t-label font-mono uppercase px-1.5 py-0.5 pill border ${
                isLiveArm
                  ? 'border-[#e0245e] text-[#e0245e] bg-[#e0245e]/8'
                  : 'border-[#04121f]/45 text-[#04121f]/64'
              }`}>
                {isLiveArm ? '● live so-101' : 'sim'}
              </span>
            </div>
            <span className={`t-label font-mono uppercase px-2 py-0.5 pill border ${
              isActive ? 'border-[#00c895] text-[#00c895] bg-[#00c895]/8' : 'border-[#04121f]/60 text-[#04121f]/76'
            }`}>
              {armStatus.status || 'idle'}
            </span>
          </div>
          {IS_LOOPBACK ? (
            <ArmVideoFeed active={isActive} detail={armStatus.detail} />
          ) : (
            <ArmLiveView
              angles={jointAngles}
              gripperState={gripperState}
              active={isActive}
              detail={armStatus.detail}
            />
          )}
          {/* Per-unit transaction banner */}
          <UnitBanner unit={currentUnit} status={armStatus.status} />
        </div>

        {/* Right: Joint Telemetry */}
        <div className="w-60 rounded-card border border-[#00c895]/34 bg-white p-3 flex flex-col shadow-sm">
          <span className="t-label uppercase text-[#04121f]/80 tracking-wider mb-2">Joint Telemetry</span>
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
      <div className="h-32 rounded-card border border-[#00c895]/34 bg-white flex flex-col overflow-hidden shadow-sm">
        <div className="px-3 py-1.5 border-b border-[#00c895]/28 flex items-center gap-2">
          <div className="w-1.5 h-1.5 pill bg-[#00c895] animate-live" />
          <span className="t-label uppercase text-[#04121f]/80 tracking-wider">Command Log</span>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-1">
          {commandLog.map((entry) => (
            <div key={entry.id} className="py-0.5 flex gap-2 items-start font-mono t-label">
              <span className="text-[#04121f]/72 shrink-0">{entry.time}</span>
              <span className="text-[#00c895]/70 shrink-0">{entry.topic}</span>
              <span className="text-[#04121f]/90 break-all">{entry.message}</span>
            </div>
          ))}
          {commandLog.length === 0 && (
            <span className="t-label font-mono text-[#04121f]/64">Awaiting arm events…</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

// Embedded footage of the physical SO-101 — used by the hardware-free Pages
// build so the kiosk still shows a moving arm without WebGL or a live stream.
// Shares the same status overlay as the live view.
function ArmVideoFeed({ active, detail }) {
  const src =
    `https://www.youtube-nocookie.com/embed/${ARM_VIDEO_ID}` +
    `?autoplay=1&mute=1&loop=1&playlist=${ARM_VIDEO_ID}` +
    `&controls=0&modestbranding=1&playsinline=1&rel=0&showinfo=0`;
  return (
    <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
      <iframe
        className="absolute inset-0 w-full h-full"
        src={src}
        title="SO-101 arm"
        frameBorder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      {/* Status overlay driven by the arm/status event stream */}
      <div className="absolute bottom-0 inset-x-0 flex items-center gap-2 px-3 py-2
        bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <span className={`w-1.5 h-1.5 pill ${active ? 'bg-[#00c895] animate-live' : 'bg-white/50'}`} />
        <span className="t-label font-mono uppercase tracking-wider text-white/90 truncate">
          {active ? (detail || 'Arm executing — telemetry live') : 'Arm idle — streaming pose'}
        </span>
      </div>
    </div>
  );
}

// Live 3D SO-101 — a WebGL articulated arm driven directly by the joint-angle
// telemetry stream (sim OR the physical arm-bridge; same jointAngles shape).
// A small status overlay reflects the live arm/status event. If WebGL is
// unavailable, an error boundary falls back to the joint-angle readout.
class WebGLBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function ArmLiveView({ angles, gripperState, active, detail }) {
  return (
    <div className="relative flex-1 min-h-0 bg-[#04121f] overflow-hidden">
      <WebGLBoundary fallback={<ArmAngleFallback angles={angles} />}>
        <Suspense fallback={<ArmAngleFallback angles={angles} />}>
          <Arm3D angles={angles} gripperState={gripperState} active={active} />
        </Suspense>
      </WebGLBoundary>
      {/* Status overlay driven by the arm/status event stream */}
      <div className="absolute bottom-0 inset-x-0 flex items-center gap-2 px-3 py-2
        bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <span className={`w-1.5 h-1.5 pill ${active ? 'bg-[#00c895] animate-live' : 'bg-white/50'}`} />
        <span className="t-label font-mono uppercase tracking-wider text-white/90 truncate">
          {active ? (detail || 'Arm executing — telemetry live') : 'Arm idle — streaming pose'}
        </span>
      </div>
    </div>
  );
}

// Fallback when WebGL can't run: a plain numeric pose readout so the live
// telemetry is still visible.
function ArmAngleFallback({ angles = [] }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/85 font-mono">
      <span className="t-label uppercase tracking-wider text-white/60 mb-1">Pose (deg)</span>
      {JOINT_NAMES.map((name, i) => (
        <span key={name} className="t-data">
          {name}: {(angles[i] ?? 0).toFixed(1)}°
        </span>
      ))}
    </div>
  );
}

function UnitBanner({ unit, status }) {
  if (!unit) return null;
  const sweet = SWEETS.find((s) => s.id === unit.sweetType);
  return (
    <div className="px-3 py-2 border-t border-[#00c895]/28 flex items-center gap-3">
      <span className="text-lg">{sweet?.emoji || '🍬'}</span>
      <div className="flex flex-col leading-tight">
        <span className="t-data font-mono text-[#04121f]">{unit.itemId}</span>
        <span className="t-label text-[#04121f]/80">
          Unit {unit.unitIndex}/{unit.totalUnits} · {sweet?.name || unit.sweetType}
        </span>
      </div>
      <span className={`ml-auto t-label font-mono uppercase px-2 py-0.5 pill ${
        status === 'executing' ? 'text-[#00c895] bg-[#00c895]/8' : 'text-[#04121f]/76 bg-[#04121f]/5'
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
        <span className="t-label font-mono text-[#04121f]/80">{name}</span>
        <span className="t-label font-mono text-[#04121f]">{displayValue}</span>
      </div>
      <div className="h-1.5 pill bg-[#00c895]/10 overflow-hidden">
        <div
          className="h-full pill bg-gradient-to-r from-[#5eead4] to-[#00c895] transition-all duration-200"
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
    <div className="rounded-card border border-[#00c895]/48 bg-[#00c895]/5 p-3 flex items-center gap-3 shadow-sm">
      <div className="flex-1">
        <div className="t-label uppercase text-[#00c895] tracking-wider mb-0.5">Approval Required</div>
        <p className="t-data font-mono text-[#04121f]">{action}</p>
        {reason && <p className="t-label font-mono text-[#04121f]/82 mt-0.5">{reason}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onApprove}
          className="px-4 py-1.5 pill bg-[#00c895] text-white font-semibold t-label uppercase tracking-wider
            hover:opacity-90 active:opacity-75 transition-opacity"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          className="px-4 py-1.5 pill border border-[#04121f]/64 text-[#04121f]/88 font-semibold t-label uppercase tracking-wider
            hover:bg-[#04121f]/5 transition-colors"
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
