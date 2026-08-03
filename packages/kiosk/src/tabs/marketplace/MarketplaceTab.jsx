import { useState, useRef, useEffect, useMemo } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { MARKETPLACE, WILDCARDS } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';
import { LEVEL_COLORS } from '../../constants/theme.js';

// ─── Chatbot Flow Definition ─────────────────────────────────────────
// Scripted decision tree — no LLM needed. Instant, reliable, impressive.

const EVENT_TYPES = [
  { id: 'wedding', label: 'Wedding', icon: '💒' },
  { id: 'party', label: 'Party', icon: '🎉' },
  { id: 'birthday', label: 'Birthday', icon: '🎂' },
  { id: 'corporate', label: 'Corporate Event', icon: '🏢' },
];

const COLOR_THEMES = [
  { id: 'gold', label: 'Gold & Classic', sweets: ['goldbears', 'happy-cola'] },
  { id: 'colorful', label: 'Bright & Colorful', sweets: ['starmix', 'tangfastics'] },
  { id: 'mixed', label: 'A bit of everything', sweets: ['goldbears', 'happy-cola', 'starmix', 'tangfastics'] },
];

function computeBasket(eventType, guestCount, colorTheme) {
  const theme = COLOR_THEMES.find((c) => c.id === colorTheme) || COLOR_THEMES[2];
  const perSweet = Math.max(1, Math.min(10, Math.ceil(guestCount / theme.sweets.length / 5)));
  return theme.sweets.map((sweetId) => ({
    sweetType: sweetId,
    quantity: perSweet,
  }));
}

const STEPS = {
  GREETING: 'greeting',
  EVENT_TYPE: 'event_type',
  GUESTS: 'guests',
  COLORS: 'colors',
  NAME: 'name',
  EMAIL: 'email',
  CONFIRM: 'confirm',
  DONE: 'done',
};

function getGreeting() {
  return "Hello! I'm your Solace Sweets assistant. I'll help you put together the perfect sweet selection for your event. What kind of event are you planning?";
}

function getGuestsPrompt(eventType) {
  const evt = EVENT_TYPES.find((e) => e.id === eventType);
  return `Great choice! A ${evt?.label.toLowerCase() || 'event'} sounds wonderful. How many guests are you expecting?`;
}

function getColorsPrompt() {
  return "What vibe are you going for with the sweets?";
}

function getNamePrompt() {
  return "Perfect! I've prepared a selection for you. What's your name for the order?";
}

function getEmailPrompt() {
  return "And your professional email address?";
}

function getConfirmPrompt(basket) {
  const sweetMap = Object.fromEntries(SWEETS.map((s) => [s.id, s]));
  const lines = basket.map((item) => {
    const sweet = sweetMap[item.sweetType];
    return `  ${sweet?.emoji || '•'} ${sweet?.name || item.sweetType} × ${item.quantity}`;
  });
  return `Here's your basket:\n\n${lines.join('\n')}\n\nShall I place this order?`;
}

// ─── Component ───────────────────────────────────────────────────────

export default function MarketplaceTab() {
  const publish = usePublish();
  const orders = useSubscription(WILDCARDS.ORDERS);
  const inventoryEvents = useSubscription(WILDCARDS.ERP, 200);

  // Live per-sweet stock level from erp/inventory/level events (latest wins).
  const inventory = useMemo(() => {
    const map = {};
    // walk oldest-first so the newest reading for each sweet ends up applied
    for (const e of [...inventoryEvents].reverse()) {
      if (!e.topic?.includes('inventory/level')) continue;
      const p = e.payload || {};
      if (p.sweetType) map[p.sweetType] = { onHand: p.onHand, level: p.level };
    }
    return map;
  }, [inventoryEvents]);

  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState(STEPS.GREETING);
  const [input, setInput] = useState('');
  const [choices, setChoices] = useState(null); // current choice buttons
  const [orderData, setOrderData] = useState({
    eventType: null,
    guests: null,
    colorTheme: null,
    name: '',
    email: '',
    basket: [],
  });

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const didInit = useRef(false);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start conversation on mount (guard against StrictMode / remount double-fire)
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    addBotMessage(getGreeting());
    setChoices(EVENT_TYPES.map((e) => ({ id: e.id, label: `${e.icon} ${e.label}` })));
    setStep(STEPS.EVENT_TYPE);
  }, []);

  function addBotMessage(text) {
    setMessages((prev) => [...prev, { role: 'bot', text, time: new Date() }]);
  }

  function addUserMessage(text) {
    setMessages((prev) => [...prev, { role: 'user', text, time: new Date() }]);
  }

  function handleChoice(choice) {
    addUserMessage(choice.label);
    setChoices(null);

    switch (step) {
      case STEPS.EVENT_TYPE: {
        setOrderData((prev) => ({ ...prev, eventType: choice.id }));
        setTimeout(() => {
          addBotMessage(getGuestsPrompt(choice.id));
          setStep(STEPS.GUESTS);
          inputRef.current?.focus();
        }, 300);
        break;
      }
      case STEPS.COLORS: {
        setOrderData((prev) => {
          const basket = computeBasket(prev.eventType, prev.guests, choice.id);
          return { ...prev, colorTheme: choice.id, basket };
        });
        setTimeout(() => {
          addBotMessage(getNamePrompt());
          setStep(STEPS.NAME);
          inputRef.current?.focus();
        }, 300);
        break;
      }
      case STEPS.CONFIRM: {
        if (choice.id === 'yes') {
          placeOrder();
        } else {
          resetChat();
        }
        break;
      }
      default:
        break;
    }
  }

  function handleSubmitInput(e) {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;

    addUserMessage(value);
    setInput('');

    switch (step) {
      case STEPS.GUESTS: {
        const count = parseInt(value, 10);
        if (isNaN(count) || count < 1) {
          setTimeout(() => addBotMessage("Please enter a valid number of guests."), 200);
          return;
        }
        setOrderData((prev) => ({ ...prev, guests: Math.min(count, 500) }));
        setTimeout(() => {
          addBotMessage(getColorsPrompt());
          setChoices(COLOR_THEMES.map((c) => ({ id: c.id, label: c.label })));
          setStep(STEPS.COLORS);
        }, 300);
        break;
      }
      case STEPS.NAME: {
        setOrderData((prev) => ({ ...prev, name: value }));
        setTimeout(() => {
          addBotMessage(getEmailPrompt());
          setStep(STEPS.EMAIL);
          inputRef.current?.focus();
        }, 300);
        break;
      }
      case STEPS.EMAIL: {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          setTimeout(() => addBotMessage("That doesn't look like a valid email. Please try again."), 200);
          return;
        }
        setOrderData((prev) => ({ ...prev, email: value }));
        setTimeout(() => {
          setOrderData((prev) => {
            const basket = prev.basket.length ? prev.basket : computeBasket(prev.eventType, prev.guests, prev.colorTheme);
            addBotMessage(getConfirmPrompt(basket));
            setChoices([
              { id: 'yes', label: 'Yes, place order' },
              { id: 'no', label: 'Start over' },
            ]);
            setStep(STEPS.CONFIRM);
            return { ...prev, basket };
          });
        }, 300);
        break;
      }
      // ── Free-text at choice steps: interpret loosely so the box always works ──
      case STEPS.EVENT_TYPE: {
        const match = EVENT_TYPES.find((e) => value.toLowerCase().includes(e.id) || value.toLowerCase().includes(e.label.toLowerCase()));
        if (match) {
          handleChoice({ id: match.id, label: `${match.icon} ${match.label}` });
        } else {
          setTimeout(() => addBotMessage("Tell me the occasion — a wedding, party, birthday, or corporate event? You can tap a button or just type it."), 200);
        }
        break;
      }
      case STEPS.COLORS: {
        const v = value.toLowerCase();
        const theme = COLOR_THEMES.find((c) => v.includes(c.id) || v.includes(c.label.toLowerCase()))
          || (/(gold|classic)/.test(v) ? COLOR_THEMES[0] : /(bright|colour|color)/.test(v) ? COLOR_THEMES[1] : /(mix|every|all)/.test(v) ? COLOR_THEMES[2] : null);
        if (theme) {
          handleChoice({ id: theme.id, label: theme.label });
        } else {
          setTimeout(() => addBotMessage("Gold & Classic, Bright & Colorful, or a bit of everything?"), 200);
        }
        break;
      }
      case STEPS.CONFIRM: {
        if (/^(y|yes|ok|sure|place|confirm)/i.test(value)) handleChoice({ id: 'yes', label: 'Yes, place order' });
        else if (/^(n|no|restart|start over|cancel)/i.test(value)) handleChoice({ id: 'no', label: 'Start over' });
        else setTimeout(() => addBotMessage("Shall I place this order? (yes / start over)"), 200);
        break;
      }
      case STEPS.DONE: {
        resetChat();
        break;
      }
      default:
        setTimeout(() => addBotMessage("I'm here to help build your sweet order — tap a button above or tell me what you'd like."), 200);
        break;
    }
  }

  function placeOrder() {
    const { name, email, basket } = orderData;
    const correlationId = crypto.randomUUID();
    const envelope = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'marketplace-chatbot',
      correlationId,
      payload: {
        customerName: name,
        email,
        items: basket,
        status: 'pending',
        eventType: orderData.eventType,
        guestCount: orderData.guests,
      },
    };

    publish(MARKETPLACE.ORDER_CREATED, envelope);

    setTimeout(() => {
      addBotMessage(`Order placed! Your reference: ${correlationId.slice(0, 8).toUpperCase()}\n\nYour sweets are being prepared. Watch the event feed to see your order flow through the system.`);
      setStep(STEPS.DONE);
      setChoices([{ id: 'new', label: 'Place another order' }]);
    }, 400);
  }

  function resetChat() {
    setMessages([]);
    setOrderData({ eventType: null, guests: null, colorTheme: null, name: '', email: '', basket: [] });
    setInput('');
    setChoices(null);
    setTimeout(() => {
      addBotMessage(getGreeting());
      setChoices(EVENT_TYPES.map((e) => ({ id: e.id, label: `${e.icon} ${e.label}` })));
      setStep(STEPS.EVENT_TYPE);
    }, 100);
  }

  // Handle "Place another order"
  function handleDoneChoice(choice) {
    if (choice.id === 'new') resetChat();
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* LEFT — Chatbot */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="px-4 py-2 border-b border-[#00c895]/28 flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-[#00c895] animate-live" />
          <span className="t-label uppercase tracking-widest text-[#052e22]/65 font-mono">Solace Sweets Assistant</span>
          <span className="t-label text-[#052e22]/45 font-mono ml-auto">1 COMMERCE</span>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {messages.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}

          {/* Choice Buttons */}
          {choices && (
            <div className="flex flex-wrap gap-2 pl-0 mt-1">
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => step === STEPS.DONE ? handleDoneChoice(choice) : handleChoice(choice)}
                  className="px-3 py-1.5 border border-[#00c895]/40 text-[#052e22] t-label font-mono hover:bg-[#00c895]/5 hover:border-[#00c895] transition-colors"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input — always available, so visitors can type free text at any step */}
        <form onSubmit={handleSubmitInput} className="px-4 py-3 border-t border-[#00c895]/28 flex gap-2">
          <input
            ref={inputRef}
            type={step === STEPS.GUESTS ? 'number' : step === STEPS.EMAIL ? 'email' : 'text'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              step === STEPS.GUESTS ? 'Number of guests…' :
              step === STEPS.NAME ? 'Your name…' :
              step === STEPS.EMAIL ? 'you@company.com' :
              step === STEPS.EVENT_TYPE ? 'Type your occasion, or tap a choice…' :
              step === STEPS.COLORS ? 'Describe the vibe, or tap a choice…' :
              step === STEPS.CONFIRM ? 'yes / start over…' :
              step === STEPS.DONE ? 'Type anything to start a new order…' :
              'Type a message…'
            }
            autoFocus
            className="flex-1 bg-white border border-[#00c895]/28 text-[#052e22] font-mono px-3 py-2 t-data placeholder-[#052e22]/50 focus:outline-none focus:border-[#00c895]"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#00c895] text-white font-bold t-label uppercase tracking-wider hover:bg-[#00b285] transition-colors"
          >
            Send
          </button>
        </form>
      </div>

      {/* RIGHT — Inventory + Recent Orders */}
      <div className="w-[300px] shrink-0 flex flex-col border-l border-[#00c895]/28 min-h-0">
        {/* Live inventory */}
        <div className="px-3 py-2 border-b border-[#00c895]/28 flex items-center justify-between">
          <span className="t-label uppercase tracking-widest text-[#052e22]/65 font-mono">Candy Inventory</span>
          <span className="w-1.5 h-1.5 bg-[#00c895] animate-live" />
        </div>
        <div className="px-3 py-2 border-b border-[#00c895]/28 flex flex-col gap-2">
          {SWEETS.map((s) => (
            <InventoryRow key={s.id} sweet={s} info={inventory[s.id]} />
          ))}
        </div>

        {/* Orders */}
        <div className="px-3 py-2 border-b border-[#00c895]/28 flex items-center justify-between">
          <span className="t-label uppercase tracking-widest text-[#052e22]/65 font-mono">Orders</span>
          <span className="t-label font-mono text-[#052e22]/45">{orders.length}</span>
        </div>
        {orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#052e22]/45 t-label font-mono">
            NO ORDERS YET
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-[#00c895]/10">
            {orders.map((order, idx) => (
              <OrderRow key={order.eventId || idx} event={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function ChatBubble({ message }) {
  const isBot = message.role === 'bot';

  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] px-3 py-2 t-data whitespace-pre-wrap ${
          isBot
            ? 'bg-[#00c895]/5 border border-[#00c895]/28 text-[#052e22]/95'
            : 'bg-[#00c895]/10 border border-[#00c895]/40 text-[#052e22]'
        }`}
      >
        {isBot && (
          <div className="t-label font-mono text-[#052e22]/55 mb-1 uppercase">Solace AI</div>
        )}
        {message.text}
      </div>
    </div>
  );
}

const LEVEL_LABEL = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', unavailable: 'OUT' };

function InventoryRow({ sweet, info }) {
  const level = info?.level || 'unavailable';
  const onHand = info?.onHand;
  const color = LEVEL_COLORS[level] || LEVEL_COLORS.unavailable;
  return (
    <div className="flex items-center gap-2">
      <span className="text-base leading-none">{sweet.emoji}</span>
      <span className="t-label text-[#052e22] font-medium truncate">{sweet.name}</span>
      <span className="t-data font-mono text-[#052e22]/72 ml-auto tabular-nums">
        {onHand == null ? '—' : onHand}
      </span>
      <span
        className="t-label font-mono px-1.5 py-0.5 rounded shrink-0 w-[68px] text-center"
        style={{ color, backgroundColor: `${color}1f`, border: `1px solid ${color}55` }}
      >
        {LEVEL_LABEL[level]}
      </span>
    </div>
  );
}

function OrderRow({ event }) {
  const payload = event.payload || {};
  const items = payload.items || [];
  const sweetMap = Object.fromEntries(SWEETS.map((s) => [s.id, s]));

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="t-label text-[#052e22] font-medium truncate">{payload.customerName || '—'}</span>
        <span className="t-label font-mono border border-[#00c895]/40 text-[#052e22]/72 px-1 ml-auto shrink-0">
          {(payload.status || 'PENDING').toUpperCase()}
        </span>
      </div>
      <div className="t-label text-[#052e22]/65 font-mono mt-0.5">
        {items.map((item, i) => {
          const sweet = sweetMap[item.sweetType];
          return (
            <span key={i}>
              {sweet?.name || item.sweetType}×{item.quantity}
              {i < items.length - 1 && ' · '}
            </span>
          );
        })}
      </div>
      <div className="t-label text-[#052e22]/45 font-mono mt-0.5">
        {event.correlationId?.slice(0, 8)} · {event.timestamp && new Date(event.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
