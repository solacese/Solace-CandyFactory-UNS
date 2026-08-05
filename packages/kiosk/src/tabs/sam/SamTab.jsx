import { useMemo, useEffect, useRef, useState } from 'react';
import { useSubscription } from '../../broker/useSolace.js';
import { WILDCARDS, shortTopic as stripPrefix } from '../../constants/topics.js';
import { SAM_AGENTS } from '../../constants/chaos.js';

// SAM — Solace Agent Mesh. Observes the whole UNS, detects injected
// disruptions, reasons about them, and publishes corrective actions.
// This tab visualizes the mesh: which agent is working, the live incident
// timeline, and the running count of autonomously-resolved problems.

const STAGE_RANK = { detected: 1, reasoning: 2, action: 3, resolved: 4 };
const STAGE_LABEL = { detected: 'DETECTED', reasoning: 'REASONING', action: 'ACTING', resolved: 'RESOLVED' };
const STAGE_COLOR = { detected: '#ef4444', reasoning: '#f59e0b', action: '#0891b2', resolved: '#00c895' };

export default function SamTab() {
  // SAM publishes under enterprise/sam/*; chaos meta under enterprise/chaos/*.
  const samEvents = useSubscription(WILDCARDS.SAM, 200);
  const chaosEvents = useSubscription(WILDCARDS.CHAOS, 80);

  // Build an incident timeline keyed by incidentId. Latest stage wins.
  const incidents = useMemo(() => {
    const map = new Map();
    const upsert = (id, patch, stage) => {
      const cur = map.get(id) || { incidentId: id, stage: null, updatedAt: 0 };
      const next = { ...cur, ...patch };
      if (!cur.stage || STAGE_RANK[stage] >= STAGE_RANK[cur.stage]) next.stage = stage;
      next.updatedAt = Math.max(cur.updatedAt, patch._receivedAt || Date.now());
      map.set(id, next);
    };

    // walk oldest-first so timestamps accrue in order
    const all = [...samEvents, ...chaosEvents]
      .filter((e) => e.payload?.incidentId)
      .sort((a, b) => (a._receivedAt || 0) - (b._receivedAt || 0));

    for (const e of all) {
      const p = e.payload || {};
      const id = p.incidentId;
      const short = stripPrefix(e.topic || '');
      const base = {
        label: p.label, layer: p.layer, severity: p.severity,
        agent: p.agent, agentName: p.agentName, _receivedAt: e._receivedAt,
      };
      if (short.startsWith('chaos/')) upsert(id, { ...base, detail: p.detail }, 'detected');
      else if (short.includes('incident/detected')) upsert(id, { ...base, detail: p.detail }, 'detected');
      else if (short.includes('agent/reasoning')) upsert(id, { ...base, reasoning: p.reasoning }, 'reasoning');
      else if (short.includes('action/taken')) upsert(id, { ...base, action: p.action, actionTopic: p.actionTopic }, 'action');
      else if (short.includes('incident/resolved')) upsert(id, { ...base, resolvedMs: p.resolvedMs }, 'resolved');
    }

    return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [samEvents, chaosEvents]);

  const resolved = incidents.filter((i) => i.stage === 'resolved').length;
  const active = incidents.filter((i) => i.stage && i.stage !== 'resolved');

  // Which agents are currently busy (have a non-resolved incident)?
  const busyAgents = useMemo(() => {
    const s = new Set();
    for (const i of active) if (i.agent) s.add(i.agent);
    return s;
  }, [active]);

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#7c3aed] animate-live" />
          <h2 className="t-data font-medium text-[#052e22] uppercase tracking-wide">Solace Agent Mesh</h2>
        </div>
        <span className="t-label font-mono text-[#052e22]/55">
          {SAM_AGENTS.length} AGENTS · {resolved} RESOLVED · {active.length} ACTIVE
        </span>
      </div>

      {/* Explainer */}
      <div className="border border-[#7c3aed]/28 bg-[#7c3aed]/[0.04] px-3 py-2 t-label font-mono text-[#052e22]/75 leading-relaxed">
        SAM agents subscribe to the entire UNS. When a disruption appears
        <span className="text-[#ef4444] font-medium"> (red events)</span>, an agent detects it,
        reasons with an LLM, and publishes a corrective event — no human in the loop.
        Press <span className="text-[#052e22] font-medium">Trigger chaos</span> to inject one.
      </div>

      {/* Agent mesh */}
      <div className="grid grid-cols-4 gap-3">
        {SAM_AGENTS.map((a) => {
          const busy = busyAgents.has(a.id);
          return (
            <div
              key={a.id}
              className="border px-3 py-3 flex flex-col gap-1.5 transition-colors"
              style={{
                borderColor: busy ? a.color : 'rgba(6,120,90,0.28)',
                background: busy ? `${a.color}0f` : 'transparent',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 shrink-0 ${busy ? 'animate-live' : ''}`}
                  style={{ background: busy ? a.color : 'rgba(5,46,34,0.2)' }}
                />
                <span className="t-data font-medium text-[#052e22] truncate">{a.name}</span>
              </div>
              <span className="t-label font-mono text-[#052e22]/60 leading-snug">{a.role}</span>
              <span className="t-label font-mono uppercase tracking-wider mt-0.5" style={{ color: busy ? a.color : 'rgba(5,46,34,0.35)' }}>
                {busy ? 'WORKING' : 'IDLE'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Incident feed */}
      <div className="flex items-center gap-2">
        <h3 className="t-label uppercase tracking-widest text-[#052e22]/65 font-mono">Incidents & Resolutions</h3>
        <div className="flex-1 h-px bg-[#00c895]/20" />
      </div>

      {incidents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[#052e22]/45 t-label font-mono text-center px-6">
          NO INCIDENTS — PRESS “TRIGGER CHAOS” TO INJECT A DISRUPTION FOR SAM TO SOLVE
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {incidents.slice(0, 10).map((inc) => (
            <IncidentCard key={inc.incidentId} inc={inc} />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ inc }) {
  const stage = inc.stage || 'detected';
  const color = STAGE_COLOR[stage];
  const resolved = stage === 'resolved';

  return (
    <div
      className="border border-l-2 px-3 py-2 bg-white"
      style={{ borderColor: 'rgba(6,120,90,0.24)', borderLeftColor: color }}
    >
      <div className="flex items-center gap-2">
        <span className="t-label font-mono font-medium px-1.5 py-0.5" style={{ color, background: `${color}1a`, border: `1px solid ${color}55` }}>
          {STAGE_LABEL[stage]}
        </span>
        <span className="t-data text-[#052e22] font-medium truncate">{inc.label || inc.incidentId}</span>
        <span className="t-label font-mono text-[#052e22]/45 ml-auto shrink-0">
          {inc.agentName || 'SAM'}
        </span>
      </div>

      {/* Timeline lines — show what SAM did */}
      <div className="mt-1.5 flex flex-col gap-1 t-label font-mono">
        {inc.detail && (
          <TimelineLine dot="#ef4444" text={inc.detail} />
        )}
        {inc.reasoning && (
          <TimelineLine dot="#f59e0b" text={inc.reasoning} />
        )}
        {inc.action && (
          <TimelineLine dot="#0891b2" text={`Action → ${stripPrefix(inc.actionTopic || '')} · ${inc.action}`} />
        )}
        {resolved && (
          <TimelineLine dot="#00c895" text={`Resolved autonomously${inc.resolvedMs ? ` in ~${(inc.resolvedMs / 1000).toFixed(1)}s` : ''}`} bold />
        )}
      </div>
    </div>
  );
}

function TimelineLine({ dot, text, bold }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-1.5 h-1.5 mt-1 shrink-0" style={{ background: dot }} />
      <span className={`text-[#052e22]/${bold ? '90' : '72'} leading-snug ${bold ? 'font-medium' : ''}`}>{text}</span>
    </div>
  );
}
