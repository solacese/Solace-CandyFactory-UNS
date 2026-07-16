# Haribot — Unified Namespace (UNS) Topology

> Complete event map for the Haribot manufacturing demo.
> All topics follow ISA-95 hierarchy: `haribot/{site}/{area}/{line}/{message-type}`

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                          SOLACE PubSub+ EVENT BROKER                                  │
│                     (MQTT :1883 / WebSocket :8008 / SEMP :9080)                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │                    │                    │                    │
        ▼                    ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  ORDERING    │   │   SAM        │   │  ARM BRIDGE  │   │  DASHBOARD   │
│  PAGE + API  │   │   AGENTS     │   │  (LeRobot)   │   │  (Live Feed) │
│              │   │              │   │              │   │              │
│ React + Node │   │ Order Agent  │   │ Python/MQTT  │   │ React + WS   │
│ :3000 / :3003│   │ Inv. Agent   │   │ SO-101 arm   │   │ :3002        │
│              │   │ Pack Agent   │   │              │   │              │
│              │   │ Arm Agent    │   │              │   │              │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        │                    │                    │                    │
        ▼                    ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              OpenMES (optional)                                        │
│                   Work Orders / OEE / Downtime / Production Tracking                  │
│                              http://localhost:8081                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Topic Namespace

```
haribot/
└── paris-demo/                          ← Site
    └── packing/                         ← Area
        └── line1/                       ← Line
            ├── orders/
            │   ├── created              ← New order from customer
            │   ├── validated            ← Order passes checks
            │   └── rejected             ← Order fails validation
            ├── inventory/
            │   ├── reserved             ← Stock reserved for order
            │   └── insufficient         ← Not enough stock
            ├── pack-job/
            │   ├── sequenced            ← Pick sequence planned
            │   └── status               ← Execution progress
            ├── arm/
            │   ├── command              ← Motion command to robot
            │   ├── telemetry            ← Joint angles @ 10Hz
            │   └── status               ← Arm state changes
            └── hitl/
                ├── approval-required    ← Needs human approval
                └── approved             ← Operator gives green light
```

---

## Event Flow (Happy Path)

```
 Customer                Ordering Page          Backend API           Solace Broker
    │                         │                      │                      │
    │──── Fill form ─────────▶│                      │                      │
    │  (name, email, sweets)  │                      │                      │
    │                         │──── POST /api/orders─▶│                      │
    │                         │                      │── orders/created ────▶│
    │                         │◀──── 201 Created ────│                      │
    │◀─── Confirmation ───────│                      │                      │
    │                         │                      │                      │
```

```
 Solace Broker          Order Agent         Inventory Agent        Packing Agent
    │                      │                      │                      │
    │── orders/created ───▶│                      │                      │
    │                      │── validate ──────────│                      │
    │◀─ orders/validated ──│                      │                      │
    │                      │                      │                      │
    │── orders/validated ──┼─────────────────────▶│                      │
    │                      │                      │── check stock ────── │
    │◀─ inventory/reserved─┼──────────────────────│                      │
    │                      │                      │                      │
    │── inventory/reserved─┼──────────────────────┼─────────────────────▶│
    │                      │                      │                      │── plan sequence
    │◀─ pack-job/sequenced─┼──────────────────────┼──────────────────────│
    │                      │                      │                      │
```

```
 Solace Broker         Arm Control Agent       Dashboard            Arm Bridge
    │                      │                      │                      │
    │─ pack-job/sequenced ▶│                      │                      │
    │                      │── plan motion ────── │                      │
    │◀ hitl/approval-req. ─│                      │                      │
    │                      │                      │                      │
    │─ hitl/approval-req.─▶┼─────────────────────▶│                      │
    │                      │                      │── Operator clicks ── │
    │◀── hitl/approved ────┼──────────────────────│                      │
    │                      │                      │                      │
    │── hitl/approved ────▶│                      │                      │
    │                      │── execute motion ──  │                      │
    │◀──── arm/command ────│                      │                      │
    │                      │                      │                      │
    │──── arm/command ─────┼──────────────────────┼─────────────────────▶│
    │                      │                      │                      │── robot moves
    │◀─── arm/telemetry ───┼──────────────────────┼──────────────────────│  (10Hz)
    │◀─── arm/status ──────┼──────────────────────┼──────────────────────│
    │                      │                      │                      │
    │─── arm/telemetry ───▶┼─────────────────────▶│                      │
    │─── arm/status ──────▶┼─────────────────────▶│                      │
    │                      │                      │                      │
```

---

## Error Flows

### Order Rejected (invalid data)

```
orders/created → Order Agent validates → orders/rejected
                                          └── payload.reason: "Invalid sweet type" | "Quantity exceeded"
```

### Insufficient Inventory

```
orders/validated → Inventory Agent checks → inventory/insufficient
                                             └── payload.reason: "Only 1 goldbears remaining"
                                             └── payload.availableStock: {...}
```

### Arm Fault

```
arm/command → Arm Bridge executes → arm/status {status: "fault", detail: "Motor overload on joint 3"}
                                     └── Triggers HITL re-approval before retry
```

### Pack Job Failed

```
pack-job/status {status: "failed", detail: "Pick missed — gripper empty"}
  └── Arm Control Agent retries or escalates
```

---

## Topic Reference Table

| Full Topic | Direction | Publisher | Subscriber(s) | Payload Key Fields |
|------------|-----------|-----------|----------------|-------------------|
| `haribot/paris-demo/packing/line1/orders/created` | → | Backend API | Order Agent, Dashboard | `customerName`, `email`, `items[]`, `status` |
| `haribot/paris-demo/packing/line1/orders/validated` | → | Order Agent | Inventory Agent, Dashboard | `customerName`, `email`, `items[]`, `status` |
| `haribot/paris-demo/packing/line1/orders/rejected` | → | Order Agent | Dashboard | `customerName`, `items[]`, `status`, `reason` |
| `haribot/paris-demo/packing/line1/inventory/reserved` | → | Inventory Agent | Packing Agent, Dashboard | `items[]`, `remainingStock{}`, `status` |
| `haribot/paris-demo/packing/line1/inventory/insufficient` | → | Inventory Agent | Dashboard | `items[]`, `availableStock{}`, `status`, `reason` |
| `haribot/paris-demo/packing/line1/pack-job/sequenced` | → | Packing Agent | Arm Control Agent, Dashboard | `sequence[]` (sweetType, qty, binPosition) |
| `haribot/paris-demo/packing/line1/pack-job/status` | → | Packing Agent | Dashboard | `status`, `detail` |
| `haribot/paris-demo/packing/line1/arm/command` | → | Arm Control Agent | Arm Bridge | `commandType`, `params{}` |
| `haribot/paris-demo/packing/line1/arm/telemetry` | → | Arm Bridge | Dashboard, OpenMES | `jointAngles[]`, `gripperState` |
| `haribot/paris-demo/packing/line1/arm/status` | → | Arm Bridge | Arm Control Agent, Dashboard | `status`, `detail` |
| `haribot/paris-demo/packing/line1/hitl/approval-required` | → | Arm Control Agent | Dashboard | `plannedMotion`, `reason`, `status` |
| `haribot/paris-demo/packing/line1/hitl/approved` | → | Dashboard (operator) | Arm Control Agent | `approvedBy`, `status` |

---

## Event Envelope Format

Every message on the UNS follows this envelope:

```json
{
  "eventId": "3a97b49d-a103-42f6-8884-d8c5a97efa25",
  "timestamp": "2026-07-16T14:30:00.000Z",
  "source": "ui | backend | order-agent | inventory-agent | packing-agent | arm-agent | arm-bridge",
  "correlationId": "08cd8395-d82f-4a14-bca9-5c2dcf7e1916",
  "payload": {
    // ... message-type-specific fields
  }
}
```

The `correlationId` ties all events from a single customer order together across the entire chain.

---

## Available Sweets (Products)

| ID | Display Name | Emoji | Bin Position |
|----|-------------|-------|--------------|
| `goldbears` | Goldbears | 🐻 | 1 |
| `happy-cola` | Happy Cola | 🥤 | 2 |
| `starmix` | Starmix | ⭐ | 3 |
| `tangfastics` | Tangfastics | 🍋 | 4 |

---

## Subscriptions by Component

| Component | Subscribes To | Protocol |
|-----------|--------------|----------|
| **Order Agent** | `orders/created` | SAM (via event-bridge) |
| **Inventory Agent** | `orders/validated` | SAM (via event-bridge) |
| **Packing Agent** | `inventory/reserved` | SAM (via event-bridge) |
| **Arm Control Agent** | `pack-job/sequenced`, `hitl/approved`, `arm/status` | SAM (via event-bridge) |
| **Arm Bridge** | `arm/command` | MQTT (paho-mqtt) |
| **Dashboard** | `haribot/>` (wildcard all) | WebSocket (solclientjs) |
| **Backend API** | — (publish only) | WebSocket (solclientjs) |
| **OpenMES** | `arm/telemetry`, `pack-job/status` | MQTT |

---

## Wildcard Subscriptions

| Pattern | Matches |
|---------|---------|
| `haribot/>` | Everything in the namespace |
| `haribot/paris-demo/packing/line1/>` | All events for line1 |
| `haribot/paris-demo/packing/line1/arm/>` | All arm events |
| `haribot/paris-demo/packing/*/orders/created` | Orders from any line |

---

## Infrastructure Ports

| Service | Port | Protocol | Credentials |
|---------|------|----------|-------------|
| Solace MQTT | 1883 | MQTT 3.1.1/5 | haribot / haribot |
| Solace WebSocket | 8008 | WS (SMF) | haribot / haribot |
| Solace SEMP (mgmt) | 9080 | HTTP REST | admin / admin |
| Backend API | 3003 | HTTP | — |
| Ordering Page | 3000 | HTTP | — |
| Dashboard | 3002 | HTTP | — |
| OpenMES | 8081 | HTTP | admin / plPc0iiCysW42nVtfrXbtaBL |
