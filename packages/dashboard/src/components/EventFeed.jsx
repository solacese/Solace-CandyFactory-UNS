import React, { useState, useMemo } from 'react';

const TOPIC_COLORS = {
  'orders': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  'inventory': 'text-green-400 bg-green-400/10 border-green-400/30',
  'pack-job': 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  'arm': 'text-red-400 bg-red-400/10 border-red-400/30',
  'hitl': 'text-purple-400 bg-purple-400/10 border-purple-400/30',
};

function getTopicColor(topic) {
  const suffix = topic.replace('haribot/paris-demo/packing/line1/', '');
  const category = suffix.split('/')[0];
  return TOPIC_COLORS[category] || 'text-gray-400 bg-gray-400/10 border-gray-400/30';
}

function getShortTopic(topic) {
  return topic.replace('haribot/paris-demo/packing/line1/', '');
}

export default function EventFeed({ events }) {
  const [filterCorrelation, setFilterCorrelation] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());

  const filtered = useMemo(() => {
    let result = events;
    if (filterCorrelation) {
      result = result.filter((e) => e.correlationId === filterCorrelation);
    }
    if (filterCategory) {
      result = result.filter((e) => getShortTopic(e.topic).startsWith(filterCategory));
    }
    return result;
  }, [events, filterCorrelation, filterCategory]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const correlationIds = useMemo(() => {
    const ids = new Set(events.map((e) => e.correlationId).filter(Boolean));
    return [...ids];
  }, [events]);

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-[#03213B] border border-[#00C895]/30 text-white text-sm rounded px-3 py-1.5"
        >
          <option value="">ALL TOPICS</option>
          <option value="orders">ORDERS</option>
          <option value="inventory">INVENTORY</option>
          <option value="pack-job">PACK JOB</option>
          <option value="arm">ARM</option>
          <option value="hitl">HITL</option>
        </select>

        <select
          value={filterCorrelation}
          onChange={(e) => setFilterCorrelation(e.target.value)}
          className="bg-[#03213B] border border-[#00C895]/30 text-white text-sm rounded px-3 py-1.5"
        >
          <option value="">ALL ORDERS</option>
          {correlationIds.map((id) => (
            <option key={id} value={id}>
              {id.slice(0, 8)}...
            </option>
          ))}
        </select>

        {(filterCorrelation || filterCategory) && (
          <button
            onClick={() => { setFilterCorrelation(''); setFilterCategory(''); }}
            className="text-[#00C895] text-sm hover:underline"
          >
            Clear Filters
          </button>
        )}

        <span className="ml-auto text-sm text-white/40">
          {filtered.length} / {events.length} events
        </span>
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <div className="text-center text-white/40 py-12">
            <p className="text-4xl mb-4">📡</p>
            <p>Waiting for events on the UNS...</p>
            <p className="text-sm mt-2">Submit an order to see the event flow</p>
          </div>
        ) : (
          filtered.map((event) => {
            const shortTopic = getShortTopic(event.topic);
            const color = getTopicColor(event.topic);
            const isExpanded = expandedIds.has(event.eventId);
            const time = new Date(event.timestamp).toLocaleTimeString();

            return (
              <div
                key={event.eventId}
                className={`border rounded-lg px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors ${color}`}
                onClick={() => toggleExpand(event.eventId)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono opacity-60">{time}</span>
                  <span className="font-bold text-sm">{shortTopic}</span>
                  <span className="text-xs opacity-60">via {event.source}</span>
                  <button
                    className="ml-auto text-xs opacity-40 hover:opacity-100 px-2 py-0.5 rounded bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterCorrelation(event.correlationId);
                    }}
                  >
                    {event.correlationId?.slice(0, 8)}
                  </button>
                </div>
                {isExpanded && (
                  <pre className="mt-2 text-xs opacity-80 overflow-x-auto bg-black/20 rounded p-2 max-h-48">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
