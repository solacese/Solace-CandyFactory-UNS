# Solace CandyFactory UNS

A live customer-facing demo for Solace: manufacturing + Unified Namespace (UNS) + robotics. Demonstrates how **Solace Agent Mesh (SAM)** lets AI agents observe and act on a real-time, event-driven UNS, with a human-safe control boundary around physical actuation.

> **Live kiosk demo (sim-only, no broker):** https://solacese.github.io/Solace-CandyFactory-UNS/ — the kiosk running against an in-browser loopback so the full ISA-95 event cascade plays with zero backend.

## Demo Flow

1. Customer scans QR code and orders a custom sweet mix (name + professional email)
2. The order becomes an event on the UNS instantly
3. A chain of SAM agents: validate order, check inventory, sequence pack job, control robot
4. Dashboard shows the entire chain live with a raw UNS event feed
5. The SO-101 arm executes pick-and-place with a hard human-in-the-loop gate

---

## Quick Start (All Local)

### Prerequisites

- Node.js >= 20
- Python >= 3.10
- Docker (for Solace broker + OpenMES)
- An OpenAI API key (for SAM agents)

### 1. Start Infrastructure (Docker)

```bash
# Start Solace PubSub+ broker
docker compose -f docker-compose.solace.yml up -d

# Wait ~30s for broker to boot, then create client user
curl -u admin:admin -X POST http://localhost:9080/SEMP/v2/config/msgVpns/default/clientUsernames \
  -H "Content-Type: application/json" \
  -d '{"clientUsername":"haribot","password":"haribot","enabled":true}'
```

Optionally, start OpenMES for full manufacturing execution:
```bash
cd ../so-101-dojo/openmes && docker compose up -d
# Access at http://localhost:8081 (admin / plPc0iiCysW42nVtfrXbtaBL)
```

### 2. Install & Configure

```bash
cp .env.example .env
npm install
```

### 3. Run the Stack (3 terminals minimum)

```bash
# Terminal 1: Backend API (port 3003)
npm run backend

# Terminal 2: Ordering Page (http://localhost:3000)
npm run ordering

# Terminal 3: Dashboard (http://localhost:3002)
npm run dashboard
```

### 4. (Optional) Real Robot Arm

```bash
# In .env, set:
#   ARM_MODE=real
#   ARM_SERIAL_PORT=/dev/tty.usbmodem5B3D0457761

# Start the LeRobot arm bridge (separate terminal, in lerobot venv)
source ~/lerobot/.venv/bin/activate
cd packages/arm-bridge
pip install -r requirements.txt
python bridge.py
```

### 5. (Optional) SAM Agents

```bash
cd agents
python3 -m venv .venv
source .venv/bin/activate
pip install solace-agent-mesh
# Edit agents/.env with your OPENAI_API_KEY
sam run
# In another terminal:
python -m src.event_bridge
```

### 6. Monitor Broker Events

**Browser (Try Me):**
- Open http://localhost:9080 → login `admin`/`admin`
- Go to Message VPN → `default` → Try Me
- Subscriber: connect, subscribe to `haribot/>`

**CLI:**
```bash
brew install mosquitto
mosquitto_sub -h localhost -p 1883 -u haribot -P haribot -t "haribot/#" -v
```

---

## Architecture

### UNS Topic Taxonomy (ISA-95)

```
haribot/{site}/{area}/{line}/{message-type}
```

| Topic | Publisher | Purpose |
|-------|-----------|---------|
| `orders/created` | Ordering Page | New order submitted |
| `orders/validated` | Order Agent | Order passes validation |
| `orders/rejected` | Order Agent | Order fails validation |
| `inventory/reserved` | Inventory Agent | Stock reserved |
| `inventory/insufficient` | Inventory Agent | Insufficient stock |
| `pack-job/sequenced` | Packing Agent | Pick sequence planned |
| `pack-job/status` | Packing Agent | Execution progress |
| `arm/command` | Arm Control Agent | Motion command |
| `arm/telemetry` | Arm Bridge | Joint angles at 10Hz |
| `arm/status` | Arm Bridge | State changes |
| `hitl/approval-required` | Arm Control Agent | Requests approval |
| `hitl/approved` | Dashboard UI | Operator approves |

### Event Envelope

```json
{
  "eventId": "uuid-v4",
  "timestamp": "ISO8601",
  "source": "order-agent | inventory-agent | packing-agent | arm-agent | arm-bridge | ui",
  "correlationId": "uuid-v4",
  "payload": { }
}
```

### Order Payload (example)

```json
{
  "customerName": "Jane Smith",
  "email": "jane@acme.com",
  "items": [
    { "sweetType": "goldbears", "quantity": 3 },
    { "sweetType": "starmix", "quantity": 2 }
  ],
  "status": "pending"
}
```

### Available Sweets

| ID | Name | Emoji |
|----|------|-------|
| `goldbears` | Goldbears | 🐻 |
| `happy-cola` | Happy Cola | 🥤 |
| `starmix` | Starmix | ⭐ |
| `tangfastics` | Tangfastics | 🍋 |

### SAM Agents

| Agent | Responsibility | Tools |
|-------|---------------|-------|
| Order Agent | Validate orders | `validate_order` |
| Inventory Agent | Reserve stock | `check_and_reserve_inventory`, `get_current_stock` |
| Packing Agent | Sequence picks | `sequence_pack_job`, `update_pack_status` |
| Arm Control Agent | Plan + execute motion (with HITL gate) | `plan_motion`, `request_hitl_approval`, `execute_motion` |

---

## Key URLs (Local)

| Service | URL |
|---------|-----|
| Ordering Page | http://localhost:3000 |
| Backend API | http://localhost:3003 |
| Dashboard | http://localhost:3002 |
| Solace Management | http://localhost:9080 (admin/admin) |
| Solace MQTT | localhost:1883 |
| Solace WebSocket | localhost:8008 |
| OpenMES | http://localhost:8081 |
| SAM WebUI | http://localhost:8000 |

---

## Demo Controls

- **Reset Demo**: `curl -X POST http://localhost:3003/api/reset`
- **Trigger Failure**: `curl -X POST http://localhost:3003/api/trigger-failure -H "Content-Type: application/json" -d '{"scenario":"insufficient-stock"}'`
- **Emergency Stop**: Big red button on the ARM CONTROL tab
- **Test Order (CLI)**:
  ```bash
  curl -X POST http://localhost:3003/api/orders \
    -H "Content-Type: application/json" \
    -d '{"customerName":"Test","email":"test@company.com","items":[{"sweetType":"goldbears","quantity":2}]}'
  ```

---

## Project Structure

```
packages/
  common/           Shared types, topics, envelope helpers (4 sweet types)
  broker-client/    Solace connection wrapper (solclientjs WebSocket)
  backend/          Express API — orders, reset, broker publish (port 3003)
  ordering-page/    React mobile ordering — name, email, sweets (Vite, port 3000)
  dashboard/        React dashboard + UNS feed (Vite + Tailwind, port 3002)
  arm-driver/       Simulated SO-101 driver (Node.js)
  arm-bridge/       Real SO-101 driver via LeRobot (Python, MQTT)
  test-harness/     Pub/sub test scripts
agents/
  configs/          SAM agent YAML definitions
  src/tools/        Python tools for each agent
  src/db/           SQLite inventory
  src/event_bridge.py  UNS-to-SAM routing
assets/
  qr-code.svg      Printable QR code
  qr-code.png
```

---

## Branding

- **Ordering Page**: Playful, Haribo-adjacent (bright colors, Fredoka font)
- **Dashboard**: Solace identity (Dark Blue #03213B, Classic Green #00C895, White, Calibri, ALL CAPS titles)

---

## Safety

The arm control agent has a **hard-coded safety gate**: `execute_motion` physically cannot publish `arm/command` without a prior `hitl/approved` event carrying the matching `correlationId`. This is enforced in Python code, not just the LLM prompt.
