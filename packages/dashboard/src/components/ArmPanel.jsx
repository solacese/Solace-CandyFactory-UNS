import React, { useState, useCallback } from 'react';
import { publishMessage } from '../broker.js';

const JOINT_NAMES = ['Base', 'Shoulder', 'Elbow', 'Wrist Pitch', 'Wrist Roll', 'Gripper'];
const JOINT_LIMITS = [
  [-180, 180], // Base
  [-90, 90],   // Shoulder
  [-90, 90],   // Elbow
  [-90, 90],   // Wrist Pitch
  [-180, 180], // Wrist Roll
  [0, 100],    // Gripper (0=closed, 100=open)
];

const STATUS_COLORS = {
  idle: 'text-gray-400',
  planning: 'text-blue-400',
  'awaiting-approval': 'text-purple-400',
  executing: 'text-amber-400',
  fault: 'text-red-400',
};

export default function ArmPanel({ armStatus, hitlPending, onApprove }) {
  const [mode, setMode] = useState('autonomous');

  const sendJogCommand = useCallback((jointIndex, direction) => {
    const event = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'ui',
      correlationId: 'manual-jog',
      payload: {
        commandType: 'jog',
        params: { joint: jointIndex, direction, speed: 10 },
      },
    };
    publishMessage('haribot/paris-demo/packing/line1/arm/command', event);
  }, []);

  const sendHome = useCallback(() => {
    const event = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'ui',
      correlationId: 'manual-home',
      payload: { commandType: 'home', params: {} },
    };
    publishMessage('haribot/paris-demo/packing/line1/arm/command', event);
  }, []);

  const sendEmergencyStop = useCallback(() => {
    const event = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'ui',
      correlationId: 'emergency-stop',
      payload: { commandType: 'stop', params: { emergency: true } },
    };
    publishMessage('haribot/paris-demo/packing/line1/arm/command', event);
  }, []);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Emergency Stop - ALWAYS visible */}
      <button
        onClick={sendEmergencyStop}
        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl text-xl shadow-lg shadow-red-600/30 active:scale-[0.98] transition-transform"
      >
        🛑 EMERGENCY STOP
      </button>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Telemetry + Status */}
        <div className="w-1/2 space-y-4">
          {/* Status */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white/60 mb-3">ARM STATUS</h2>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${armStatus.status === 'executing' ? 'bg-amber-400 animate-pulse' : armStatus.status === 'fault' ? 'bg-red-500' : 'bg-[#00C895]'}`}></div>
              <span className={`text-lg font-bold uppercase ${STATUS_COLORS[armStatus.status] || 'text-white'}`}>
                {armStatus.status}
              </span>
            </div>
          </div>

          {/* Joint Angles */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white/60 mb-3">JOINT TELEMETRY</h2>
            <div className="space-y-2">
              {JOINT_NAMES.map((name, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-white/60 w-24">{name}</span>
                  <div className="flex-1 mx-3 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00C895] rounded-full transition-all duration-300"
                      style={{
                        width: `${((armStatus.jointAngles[i] || 0) - JOINT_LIMITS[i][0]) / (JOINT_LIMITS[i][1] - JOINT_LIMITS[i][0]) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="text-xs font-mono text-white/80 w-12 text-right">
                    {(armStatus.jointAngles[i] || 0).toFixed(1)}°
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Gripper */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white/60 mb-2">GRIPPER</h2>
            <span className="text-lg">
              {armStatus.gripperState === 'open' ? '✋ OPEN' : armStatus.gripperState === 'closed' ? '✊ CLOSED' : `🤏 ${armStatus.gripperState}%`}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="w-1/2 space-y-4">
          {/* Mode Toggle */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white/60 mb-3">MODE</h2>
            <div className="flex gap-2">
              {['autonomous', 'manual'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${
                    mode === m ? 'bg-[#00C895] text-[#03213B]' : 'bg-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {mode === 'manual' ? (
            /* Manual Jog Controls */
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-white/60 mb-3">JOG CONTROLS</h2>
              {JOINT_NAMES.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-white/60 w-24">{name}</span>
                  <button
                    onClick={() => sendJogCommand(i, -1)}
                    className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white font-bold text-sm"
                  >
                    -
                  </button>
                  <button
                    onClick={() => sendJogCommand(i, 1)}
                    className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white font-bold text-sm"
                  >
                    +
                  </button>
                </div>
              ))}
              <button
                onClick={sendHome}
                className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm"
              >
                🏠 HOME
              </button>
            </div>
          ) : (
            /* Autonomous Mode */
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h2 className="text-sm font-bold text-white/60 mb-3">AUTONOMOUS CONTROL</h2>
              {hitlPending ? (
                <div className="space-y-3">
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                    <p className="text-sm text-purple-300 font-bold mb-1">MOTION PLAN READY</p>
                    <p className="text-xs text-white/60">
                      {hitlPending.plannedMotion?.summary || 'Motion planned and awaiting approval'}
                    </p>
                  </div>
                  <button
                    onClick={onApprove}
                    className="w-full py-3 bg-[#00C895] hover:bg-[#00C895]/80 text-[#03213B] font-bold rounded-lg transition-colors"
                  >
                    ✅ APPROVE MOTION
                  </button>
                </div>
              ) : (
                <p className="text-sm text-white/40">
                  {armStatus.status === 'executing' ? 'Arm is executing motion...' :
                   armStatus.status === 'idle' ? 'Waiting for pack job...' :
                   `Status: ${armStatus.status}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
