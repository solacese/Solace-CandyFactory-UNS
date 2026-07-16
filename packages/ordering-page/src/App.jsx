import React, { useState } from 'react';

const SWEETS = [
  { id: 'goldbears', name: 'Goldbears', emoji: '🐻' },
  { id: 'happy-cola', name: 'Happy Cola', emoji: '🥤' },
  { id: 'starmix', name: 'Starmix', emoji: '⭐' },
  { id: 'tangfastics', name: 'Tangfastics', emoji: '🍋' },
];

const MAX_QUANTITY = 10;

export default function App() {
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const setQty = (id, delta) => {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(MAX_QUANTITY, current + delta));
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const selectedItems = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([sweetType, quantity]) => ({ sweetType, quantity }));

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = customerName.trim().length > 0 && isValidEmail && selectedItems.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          email: email.trim(),
          items: selectedItems,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setSubmitting(false);
        return;
      }

      setConfirmation(data);
    } catch (err) {
      setError('Cannot reach the order server. Please try again.');
    }

    setSubmitting(false);
  };

  const reset = () => {
    setCustomerName('');
    setEmail('');
    setQuantities({});
    setConfirmation(null);
    setError(null);
  };

  if (confirmation) {
    return (
      <div className="container">
        <div className="confirmation">
          <div className="check">🎉</div>
          <h2>Order Placed!</h2>
          <p>Your sweets are being prepared.</p>
          <p>Watch the dashboard to see your order come to life!</p>
          <div className="order-id">ID: {confirmation.correlationId.slice(0, 8)}</div>
          <br />
          <button className="new-order-btn" onClick={reset}>
            Order Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🍬 Haribot</h1>
        <p>Pick your sweets mix!</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Your Name</label>
          <input
            type="text"
            placeholder="Enter your name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            maxLength={50}
          />
        </div>

        <div className="form-group">
          <label>Professional Email</label>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Pick Your Sweets</label>
          <div className="sweets-grid">
            {SWEETS.map((sweet) => {
              const qty = quantities[sweet.id] || 0;
              return (
                <div
                  key={sweet.id}
                  className={`sweet-card ${qty > 0 ? 'selected' : ''}`}
                  onClick={() => qty === 0 && setQty(sweet.id, 1)}
                >
                  <div className="sweet-emoji">{sweet.emoji}</div>
                  <div className="sweet-name">{sweet.name}</div>
                  <div className="quantity-control">
                    <button
                      type="button"
                      className="quantity-btn"
                      onClick={(e) => { e.stopPropagation(); setQty(sweet.id, -1); }}
                      disabled={qty === 0}
                    >
                      -
                    </button>
                    <span className="quantity-value">{qty}</span>
                    <button
                      type="button"
                      className="quantity-btn"
                      onClick={(e) => { e.stopPropagation(); setQty(sweet.id, 1); }}
                      disabled={qty >= MAX_QUANTITY}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button type="submit" className="submit-btn" disabled={!canSubmit || submitting}>
          {submitting ? 'Ordering...' : `Order ${selectedItems.length > 0 ? `(${selectedItems.reduce((s, i) => s + i.quantity, 0)} items)` : ''}`}
        </button>
      </form>
    </div>
  );
}
