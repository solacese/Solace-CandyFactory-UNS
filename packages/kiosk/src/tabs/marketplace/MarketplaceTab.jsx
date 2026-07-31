import { useState, useRef, useEffect } from 'react';
import { useSubscription, usePublish } from '../../broker/useSolace.js';
import { MARKETPLACE, WILDCARDS } from '../../constants/topics.js';
import { SWEETS } from '../../constants/demo-data.js';

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
      default:
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

        {/* Input */}
        {(step === STEPS.GUESTS || step === STEPS.NAME || step === STEPS.EMAIL) && (
          <form onSubmit={handleSubmitInput} className="px-4 py-3 border-t border-[#00c895]/28 flex gap-2">
            <input
              ref={inputRef}
              type={step === STEPS.GUESTS ? 'number' : step === STEPS.EMAIL ? 'email' : 'text'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                step === STEPS.GUESTS ? 'Number of guests...' :
                step === STEPS.NAME ? 'Your name...' :
                step === STEPS.EMAIL ? 'you@company.com' : '...'
              }
              autoFocus
              className="flex-1 bg-white border border-[#00c895]/28 text-[#052e22] font-mono px-3 py-2 t-data placeholder-[#052e22]/50 focus:outline-none focus:border-[#00c895]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#00c895] text-white font-bold t-label uppercase tracking-wider"
            >
              Send
            </button>
          </form>
        )}
      </div>

      {/* RIGHT — Recent Orders */}
      <div className="w-[300px] shrink-0 flex flex-col border-l border-[#00c895]/28">
        <div className="px-3 py-2 border-b border-[#00c895]/28 flex items-center justify-between">
          <span className="t-label uppercase tracking-widest text-[#052e22]/65 font-mono">Orders</span>
          <span className="t-label font-mono text-[#052e22]/45">{orders.length}</span>
        </div>

        {orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#052e22]/45 t-label font-mono">
            NO ORDERS YET
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
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
