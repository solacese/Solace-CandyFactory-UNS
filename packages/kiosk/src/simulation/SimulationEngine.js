/**
 * SimulationEngine — The brain of the Haribot kiosk demo.
 *
 * Responsibilities:
 * 1. Subscribe to ALL events via onMessage
 * 2. React to trigger events with delayed publishes (event chain)
 * 3. Generate continuous background SCADA sensor data
 * 4. Auto-demo mode: place an order automatically if idle 30s
 */
import { onMessage, publishMessage } from '../broker/connection.js';
import { MARKETPLACE, ERP, MES, SCADA, ARM, ARM_MOTORS, SAM, CHAOS, SYSTEM } from '../constants/topics.js';
import { CHAOS_LIBRARY, SAM_AGENTS, agentFor, randomChaos } from '../constants/chaos.js';
import {
  SENSORS,
  ALARM_TYPES,
  SWEETS,
  nextWorkOrderId,
  randomCustomer,
  randomSweets,
  INVENTORY_START,
  INVENTORY_CAPACITY,
  stockLevel,
} from '../constants/demo-data.js';

// ─── Helpers ────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

function envelope(source, correlationId, payload) {
  return {
    eventId: uuid(),
    timestamp: new Date().toISOString(),
    source,
    correlationId,
    payload,
  };
}

/** Roll per-unit transactions back up into line-items: [{sweetType, quantity}]. */
function unitsToItems(units = []) {
  const counts = new Map();
  for (const u of units) {
    counts.set(u.sweetType, (counts.get(u.sweetType) || 0) + 1);
  }
  return [...counts.entries()].map(([sweetType, quantity]) => ({ sweetType, quantity }));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomNoise(base, noise) {
  return base + (Math.random() - 0.5) * 2 * noise;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─── Class ──────────────────────────────────────────────────────

export class SimulationEngine {
  constructor() {
    this._timeouts = [];
    this._intervals = [];
    this._unsubscribe = null;
    this._running = false;
    this._lastOrderTime = Date.now();
    this._sensorIndex = 0;
    this._oeeValues = { availability: 82, performance: 78, quality: 95 };
    this._conveyorSpeed = 1.2;

    // Live factory KPIs (drift over time, published on the OEE cadence).
    this._kpis = { unitsPerHour: 148, uptime: 99.1, cycleTime: 4.1, defectRate: 0.9 };

    // Per-sweet on-hand inventory. Decremented as gummies are picked,
    // topped up occasionally so it never fully drains during a booth day.
    this._inventory = {};
    for (const s of SWEETS) this._inventory[s.id] = INVENTORY_START;
    this._currentArmAngles = [0, -30, 45, 0, 0, 0]; // Default resting position
    this._armBusy = false; // true while a pick motion is actively streaming telemetry
    this._processingOrders = new Map(); // correlationId -> startedAt (watchdog)

    // ─── Leader election: exactly one open kiosk drives the cascade ──
    this._instanceId = uuid();
    this._peers = new Map(); // instanceId -> lastSeenMs
    this._isOrchestrator = false;
    this._autoDemoEnabled = true;
    this._onRoleChange = null; // (isOrchestrator) => void

    // ─── Chaos / SAM ────────────────────────────────────────────
    this._chaosCooldownMs = 5000;  // presenter can inject at most every 5s
    this._lastChaosAt = 0;
  }

  /** Register a callback fired when this instance's orchestrator role flips. */
  onRoleChange(cb) {
    this._onRoleChange = cb;
    // Fire immediately with current state
    if (cb) cb(this._isOrchestrator);
  }

  isOrchestrator() {
    return this._isOrchestrator;
  }

  setAutoDemo(enabled) {
    this._autoDemoEnabled = enabled;
    if (enabled) this._lastOrderTime = Date.now();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastOrderTime = Date.now();

    // Subscribe to all events (feed + orchestration heartbeats)
    this._unsubscribe = onMessage((topic, payload) => {
      this._handleEvent(topic, payload);
    });

    // Leader election first — decides whether we cascade or just watch.
    this._startHeartbeat();

    // Background data + auto-demo run only when orchestrator (guarded inside).
    this._startBackgroundSensors();
    this._startConveyorStatus();
    this._startOEE();
    this._startInventory();
    this._startArmHeartbeat();
    this._startAutoDemo();
    this._startWatchdog();
  }

  // ─── Watchdog ────────────────────────────────────────────────
  // Release any correlation that hasn't completed in 30s so a stuck
  // order can never permanently block its ID from being re-run.
  _startWatchdog() {
    this._setInterval(() => {
      if (!this._running) return;
      const now = Date.now();
      for (const [id, startedAt] of this._processingOrders) {
        if (now - startedAt > 30000) this._processingOrders.delete(id);
      }
    }, 10000);
  }

  stop() {
    this._running = false;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    // Clear all pending timeouts
    this._timeouts.forEach((t) => clearTimeout(t));
    this._timeouts = [];
    // Clear all intervals
    this._intervals.forEach((i) => clearInterval(i));
    this._intervals = [];
    this._processingOrders.clear();
    this._peers.clear();
    this._isOrchestrator = false;
  }

  // ─── Leader Election ─────────────────────────────────────────
  // Deterministic: lowest instanceId with a recent heartbeat wins.
  // Self-healing: if the leader's tab closes, its heartbeats stop and
  // another instance takes over within ~5s. No broker-side state needed.

  _startHeartbeat() {
    const HEARTBEAT_MS = 2000;
    const PEER_TTL_MS = 5000;

    const beat = () => {
      if (!this._running) return;
      // Announce presence
      publishMessage(
        SYSTEM.SIM_HEARTBEAT,
        envelope('sim-system', null, { instanceId: this._instanceId })
      );
      // Expire stale peers
      const now = Date.now();
      for (const [id, seen] of this._peers) {
        if (now - seen > PEER_TTL_MS) this._peers.delete(id);
      }
      // Elect: we lead if no live peer has a lower id than us
      let shouldLead = true;
      for (const id of this._peers.keys()) {
        if (id < this._instanceId) {
          shouldLead = false;
          break;
        }
      }
      if (shouldLead !== this._isOrchestrator) {
        this._isOrchestrator = shouldLead;
        if (shouldLead) this._lastOrderTime = Date.now();
        if (this._onRoleChange) this._onRoleChange(shouldLead);
      }
    };

    beat(); // immediate claim
    this._setInterval(beat, HEARTBEAT_MS);
  }

  // ─── Scheduling helpers ──────────────────────────────────────

  _delay(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this._removeTimeout(t);
        resolve();
      }, ms);
      this._timeouts.push(t);
    });
  }

  _setTimeout(fn, ms) {
    const t = setTimeout(() => {
      this._removeTimeout(t);
      if (this._running) fn();
    }, ms);
    this._timeouts.push(t);
    return t;
  }

  _setInterval(fn, ms) {
    const i = setInterval(() => {
      if (this._running) fn();
    }, ms);
    this._intervals.push(i);
    return i;
  }

  _removeTimeout(t) {
    const idx = this._timeouts.indexOf(t);
    if (idx >= 0) this._timeouts.splice(idx, 1);
  }

  // ─── Event routing ───────────────────────────────────────────

  _handleEvent(topic, data) {
    if (!this._running) return;

    // Orchestration heartbeats are handled regardless of role.
    if (topic === SYSTEM.SIM_HEARTBEAT) {
      const id = data?.payload?.instanceId;
      if (id && id !== this._instanceId) this._peers.set(id, Date.now());
      return;
    }

    // Track order arrivals for auto-demo idle timing on every instance,
    // so a passive viewer that later becomes leader won't instantly fire.
    if (topic === MARKETPLACE.ORDER_CREATED) this._lastOrderTime = Date.now();

    // Only the orchestrator drives the simulated cascade — prevents
    // duplicate ERP/MES/arm chains when multiple screens are open.
    if (!this._isOrchestrator) return;

    if (topic === MARKETPLACE.ORDER_CREATED) {
      this._handleOrderCreated(data);
    } else if (topic === ERP.WORK_ORDER_RELEASED) {
      this._handleWorkOrderReleased(data);
    } else if (topic === ARM.HITL_APPROVED) {
      // Could trigger faster arm motion in future — currently a no-op in the chain
    }
  }

  // ─── Event Chain: Order → ERP ────────────────────────────────

  _handleOrderCreated(data) {
    const correlationId = data.correlationId || uuid();

    // Guard: don't process the same correlation twice
    if (this._processingOrders.has(correlationId)) return;
    this._processingOrders.set(correlationId, Date.now());

    const workOrderId = nextWorkOrderId();
    const items = data.payload?.items || randomSweets();
    const customer = data.payload?.customer || randomCustomer();

    // ERP: work-order/created (1500ms)
    this._setTimeout(() => {
      publishMessage(
        ERP.WORK_ORDER_CREATED,
        envelope('sim-erp', correlationId, {
          workOrderId,
          orderId: data.payload?.orderId || data.eventId,
          customer,
          items,
          priority: data.payload?.priority || 'medium',
          status: 'created',
        })
      );

      // ERP: material/allocated (+800ms)
      this._setTimeout(() => {
        publishMessage(
          ERP.MATERIAL_ALLOCATED,
          envelope('sim-erp', correlationId, {
            workOrderId,
            materials: items.map((it) => {
              const sweet = SWEETS.find((s) => s.id === it.sweetType) || SWEETS[0];
              return { sweetType: it.sweetType, bin: sweet.bin, allocated: it.quantity };
            }),
          })
        );
      }, 800);

      // ERP: work-order/scheduled (+2000ms from created)
      this._setTimeout(() => {
        const now = new Date();
        publishMessage(
          ERP.WORK_ORDER_SCHEDULED,
          envelope('sim-erp', correlationId, {
            workOrderId,
            status: 'scheduled',
            scheduledStart: new Date(now.getTime() + 5000).toISOString(),
            scheduledEnd: new Date(now.getTime() + 30000).toISOString(),
          })
        );

        // ERP: work-order/released (+500ms after scheduled)
        this._setTimeout(() => {
          publishMessage(
            ERP.WORK_ORDER_RELEASED,
            envelope('sim-erp', correlationId, {
              workOrderId,
              customer,
              items,
              status: 'released',
            })
          );
        }, 500);
      }, 1200);
    }, 1500);
  }

  // ─── Event Chain: Released → MES → Arm ───────────────────────

  _handleWorkOrderReleased(data) {
    const correlationId = data.correlationId || uuid();
    const workOrderId = data.payload?.workOrderId || 'WO-UNKNOWN';
    const items = data.payload?.items || [];
    const customer = data.payload?.customer || null;

    // Expand line-items into INDIVIDUAL UNITS — every gummy is its own
    // event-driven transaction, sharing the order correlationId + a unique itemId.
    const units = this._expandUnits(items, workOrderId);

    // MES: production/started
    this._setTimeout(() => {
      publishMessage(
        MES.PRODUCTION_STARTED,
        envelope('sim-mes', correlationId, {
          workOrderId,
          customer,
          lineItemCount: items.length,
          unitCount: units.length,
        })
      );

      // Process one unit at a time
      this._processUnitsSequentially(units, correlationId, workOrderId, 0, 0, customer);
    }, 1000);
  }

  /** Flatten line-items to per-unit transactions: 3x Goldbears -> 3 units. */
  _expandUnits(items, workOrderId) {
    const units = [];
    let seq = 0;
    for (const item of items) {
      const qty = Math.max(1, item.quantity || 1);
      for (let q = 0; q < qty; q++) {
        seq += 1;
        const sweet = SWEETS.find((s) => s.id === item.sweetType) || SWEETS[0];
        units.push({
          itemId: `${workOrderId}-U${String(seq).padStart(2, '0')}`,
          unitIndex: seq,
          sweetType: item.sweetType,
          sweetName: sweet.name,
          bin: sweet.bin,
        });
      }
    }
    return units;
  }

  _processUnitsSequentially(units, correlationId, workOrderId, i, packaged = 0, customer = null) {
    if (!this._running) return;
    const total = units.length;

    if (i >= total) {
      // All units done → production complete → order-completed summary →
      // work order completed (ERP).
      this._setTimeout(() => {
        publishMessage(
          MES.PRODUCTION_COMPLETE,
          envelope('sim-mes', correlationId, {
            workOrderId,
            unitsProduced: total,
            unitsPackaged: packaged,
          })
        );

        // Explicit MES order-completed summary — powers the detailed log line
        // "packaged N/M — ORDER COMPLETE".
        publishMessage(
          MES.ORDER_COMPLETED,
          envelope('sim-mes', correlationId, {
            workOrderId,
            unitsPackaged: packaged,
            totalUnits: total,
            orderComplete: true,
            customer,
            items: unitsToItems(units),
          })
        );

        this._setTimeout(() => {
          publishMessage(
            ERP.WORK_ORDER_COMPLETED,
            envelope('sim-erp', correlationId, {
              workOrderId,
              status: 'completed',
              unitsProduced: total,
              unitsPackaged: packaged,
              // Echo the items on completion so the ERP view always has them
              // even if the created/released events have scrolled out of the
              // subscriber's buffer (DIRECT messaging has no replay).
              items: unitsToItems(units),
              completedAt: new Date().toISOString(),
            })
          );
          this._processingOrders.delete(correlationId);
        }, 500);
      }, 700);
      return;
    }

    const unit = units[i];
    const sweet = SWEETS.find((s) => s.id === unit.sweetType) || SWEETS[0];
    const meta = {
      workOrderId,
      itemId: unit.itemId,
      unitIndex: unit.unitIndex,
      totalUnits: total,
      sweetType: unit.sweetType,
      sweetName: sweet.name,
      packagedSoFar: packaged,
    };

    // Draw this unit's gummy from stock → live inventory update.
    this._consumeStock(unit.sweetType);

    // MES: step-begun — one transaction per unit
    publishMessage(
      MES.PRODUCTION_STEP_BEGUN,
      envelope('sim-mes', correlationId, {
        ...meta,
        stepName: `pick-unit-${unit.unitIndex}`,
      })
    );

    // ARM: command (+400ms)
    this._setTimeout(() => {
      publishMessage(
        ARM.COMMAND,
        envelope('sim-arm', correlationId, {
          ...meta,
          commandType: 'pick',
          params: { target: sweet.name, bin: sweet.bin, quantity: 1, unit: unit.unitIndex },
        })
      );

      // HITL gate: once per order (before the first unit only)
      if (i === 0) {
        this._setTimeout(() => {
          publishMessage(
            ARM.HITL_REQUIRED,
            envelope('sim-arm', correlationId, {
              ...meta,
              action: `Begin pick sequence: ${total} units for ${workOrderId}`,
              commandType: 'pick',
              target: sweet.name,
              reason: 'First pick in new work order requires operator approval',
            })
          );
        }, 200);
      }

      // ARM: motion (~1.6s), carrying the unit context on telemetry
      this._simulateArmMotion(correlationId, sweet.bin, meta);

      // ARM: idle (+2000ms)
      this._setTimeout(() => {
        publishMessage(
          ARM.STATUS,
          envelope('sim-arm', correlationId, {
            ...meta,
            status: 'idle',
            detail: `Placed unit ${unit.unitIndex}/${total} — ${sweet.name}`,
          })
        );
      }, 2000);

      // MES: step-complete + per-unit quality check (+2400ms) → next unit
      this._setTimeout(() => {
        publishMessage(
          MES.PRODUCTION_STEP_COMPLETE,
          envelope('sim-mes', correlationId, {
            ...meta,
            stepName: `pick-unit-${unit.unitIndex}`,
          })
        );

        this._setTimeout(() => {
          const pass = Math.random() < 0.97;
          const packagedNext = packaged + (pass ? 1 : 0);
          publishMessage(
            MES.QUALITY_CHECK,
            envelope('sim-mes', correlationId, {
              ...meta,
              result: pass ? 'pass' : 'fail',
              confidence: pass ? 0.97 + Math.random() * 0.03 : 0.4 + Math.random() * 0.3,
              checkType: 'per-unit-weight',
              // Packaged running total after this unit — lets the MES log say
              // "packaged N/M" without recomputing.
              packagedSoFar: packagedNext,
              totalUnits: total,
            })
          );

          this._processUnitsSequentially(units, correlationId, workOrderId, i + 1, packagedNext, customer);
        }, 350);
      }, 2400);
    }, 400);
  }

  // ─── Arm Motion Simulation ───────────────────────────────────

  _simulateArmMotion(correlationId, binIndex, meta = {}) {
    // Target angles based on bin position
    const targets = this._getTargetAngles(binIndex);
    const startAngles = [...this._currentArmAngles];
    const steps = 16; // 16 steps over ~1.6s = 100ms apart (dense telemetry)

    // Motion owns the telemetry stream — pause the idle heartbeat.
    this._armBusy = true;

    // Publish executing status
    publishMessage(
      ARM.STATUS,
      envelope('sim-arm', correlationId, {
        ...meta,
        status: 'executing',
        detail: `Moving to Bin ${binIndex}`,
      })
    );

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this._setTimeout(() => {
        const angles = startAngles.map((start, idx) =>
          +(lerp(start, targets[idx], t) + (Math.random() - 0.5) * 0.3).toFixed(1)
        );
        this._currentArmAngles = angles;

        publishMessage(
          ARM.TELEMETRY,
          envelope('sim-arm', correlationId, {
            ...meta,
            jointAngles: angles,
            gripperState: t < 0.7 ? 'open' : 'closed',
          })
        );
        this._publishMotorTelemetry(angles, correlationId, {
          ...meta,
          moving: true,
        });
        // Last step done — hand the stream back to the idle heartbeat.
        if (i === steps) this._armBusy = false;
      }, i * 100);
    }
  }

  // Publish one telemetry event per SO-101 motor on
  // candyfactory/paris/packing/line1/arm/<motor>. Each carries that single
  // servo's angle so every motor is independently observable on the UNS.
  _publishMotorTelemetry(angles, correlationId, meta = {}) {
    ARM_MOTORS.forEach((motor, idx) => {
      const angle = angles[idx];
      if (angle === undefined) return;
      publishMessage(
        ARM.MOTOR[motor],
        envelope('sim-arm', correlationId, {
          ...meta,
          motor,
          jointIndex: idx,
          angleDeg: angle,
          unit: 'deg',
        })
      );
    });
  }

  _getTargetAngles(binIndex) {
    // Different target positions per bin
    const binTargets = {
      1: [45, 60, -30, 15, 5, 85],
      2: [20, 55, -25, 10, -5, 85],
      3: [-25, 65, -35, 20, 10, 85],
      4: [-50, 58, -28, 12, -8, 85],
    };
    return binTargets[binIndex] || binTargets[1];
  }

  // ─── Background: Arm Idle Telemetry ──────────────────────────
  // A real arm reports its pose continuously, not only while moving. Stream
  // resting telemetry at ~3Hz (with micro-jitter) whenever no pick motion is
  // active, so the ARM tab's joint bars are always event-driven and live.
  _startArmHeartbeat() {
    this._setInterval(() => {
      if (!this._running || this._armBusy) return;
      const angles = this._currentArmAngles.map(
        (a) => +(a + (Math.random() - 0.5) * 0.2).toFixed(1)
      );
      publishMessage(
        ARM.TELEMETRY,
        envelope('sim-arm', null, {
          jointAngles: angles,
          gripperState: 'open',
          idle: true,
        })
      );
      this._publishMotorTelemetry(angles, null, { idle: true });
    }, 300);
  }

  // ─── Background: Sensor Readings ─────────────────────────────

  _startBackgroundSensors() {
    // Emit EVERY sensor on each tick at a brisk cadence so all cards update
    // together and the UNS feed carries a steady stream of readings — the
    // shop floor is always talking, order or no order.
    this._setInterval(() => {
      if (!this._running) return;

      for (const sensor of SENSORS) {
        const value = +clamp(
          randomNoise(sensor.base, sensor.noise),
          sensor.min,
          sensor.max
        ).toFixed(2);

        publishMessage(
          SCADA.SENSOR_READING,
          envelope('sim-scada', null, {
            sensorId: sensor.id,
            type: sensor.type,
            value,
            unit: sensor.unit,
            location: sensor.location,
          })
        );
      }

      // Occasional alarm (1.5% per tick now that ticks are more frequent).
      if (Math.random() < 0.015) {
        const alarm = ALARM_TYPES[Math.floor(Math.random() * ALARM_TYPES.length)];
        publishMessage(
          SCADA.ALARM_RAISED,
          envelope('sim-scada', null, {
            alarmCode: alarm.code,
            message: alarm.message,
            severity: alarm.severity,
            sensor: alarm.sensor,
            triggeredValue: +randomNoise(20, 5).toFixed(2),
          })
        );
      }
    }, 900);
  }

  // ─── Background: Conveyor Status ─────────────────────────────

  _startConveyorStatus() {
    this._setInterval(() => {
      if (!this._running) return;

      // Slight drift in conveyor speed
      this._conveyorSpeed = clamp(
        this._conveyorSpeed + (Math.random() - 0.5) * 0.05,
        0.8,
        1.5
      );

      publishMessage(
        SCADA.CONVEYOR_STATUS,
        envelope('sim-scada', null, {
          speed: +this._conveyorSpeed.toFixed(2),
          unit: 'm/s',
          itemsInTransit: Math.floor(Math.random() * 5) + 1,
          status: 'running',
        })
      );
    }, 1500);
  }

  // ─── Background: OEE Updates ─────────────────────────────────

  _startOEE() {
    this._setInterval(() => {
      if (!this._running) return;

      // Slowly drift values
      this._oeeValues.availability = clamp(
        this._oeeValues.availability + (Math.random() - 0.5) * 2,
        70,
        98
      );
      this._oeeValues.performance = clamp(
        this._oeeValues.performance + (Math.random() - 0.5) * 3,
        65,
        95
      );
      this._oeeValues.quality = clamp(
        this._oeeValues.quality + (Math.random() - 0.5) * 1,
        88,
        100
      );

      const oee =
        (this._oeeValues.availability *
          this._oeeValues.performance *
          this._oeeValues.quality) /
        10000;

      // Drift the headline KPIs a touch so they read as live, staying in
      // believable bounds. Cycle + defect are "lower is better".
      this._kpis.unitsPerHour = clamp(this._kpis.unitsPerHour + (Math.random() - 0.5) * 4, 120, 165);
      this._kpis.uptime = clamp(this._kpis.uptime + (Math.random() - 0.5) * 0.4, 96.5, 99.9);
      this._kpis.cycleTime = clamp(this._kpis.cycleTime + (Math.random() - 0.5) * 0.3, 3.4, 5.2);
      this._kpis.defectRate = clamp(this._kpis.defectRate + (Math.random() - 0.5) * 0.25, 0.2, 2.4);

      publishMessage(
        MES.OEE_UPDATE,
        envelope('sim-mes', null, {
          availability: +this._oeeValues.availability.toFixed(1),
          performance: +this._oeeValues.performance.toFixed(1),
          quality: +this._oeeValues.quality.toFixed(1),
          oee: +oee.toFixed(1),
          // Headline KPIs travel on the same event so MES can color them
          // against their targets in real time.
          unitsPerHour: Math.round(this._kpis.unitsPerHour),
          uptime: +this._kpis.uptime.toFixed(1),
          cycleTime: +this._kpis.cycleTime.toFixed(1),
          defectRate: +this._kpis.defectRate.toFixed(1),
        })
      );
    }, 2500);
  }

  // ─── Background: Inventory Levels ────────────────────────────

  _startInventory() {
    // Emit the full inventory snapshot at start and on a slow cadence, and
    // gently restock so a busy booth never bottoms out.
    this._publishInventory();
    this._setInterval(() => {
      if (!this._running) return;
      // Slow organic restock (a pallet arrives now and then).
      for (const s of SWEETS) {
        if (Math.random() < 0.4) {
          this._inventory[s.id] = clamp(
            this._inventory[s.id] + Math.floor(Math.random() * 25),
            0,
            INVENTORY_CAPACITY
          );
        }
      }
      this._publishInventory();
    }, 8000);
  }

  /** Publish one inventory/level event per sweet with its bucketed level. */
  _publishInventory() {
    for (const s of SWEETS) {
      const onHand = this._inventory[s.id];
      publishMessage(
        ERP.INVENTORY_LEVEL,
        envelope('sim-erp', null, {
          sweetType: s.id,
          sweetName: s.name,
          onHand,
          capacity: INVENTORY_CAPACITY,
          level: stockLevel(onHand),
        })
      );
    }
  }

  /** Decrement stock as a unit is picked, and republish that sweet's level. */
  _consumeStock(sweetType) {
    if (this._inventory[sweetType] === undefined) return;
    this._inventory[sweetType] = clamp(this._inventory[sweetType] - 1, 0, INVENTORY_CAPACITY);
    const onHand = this._inventory[sweetType];
    const sweet = SWEETS.find((s) => s.id === sweetType);
    publishMessage(
      ERP.INVENTORY_LEVEL,
      envelope('sim-erp', null, {
        sweetType,
        sweetName: sweet?.name || sweetType,
        onHand,
        capacity: INVENTORY_CAPACITY,
        level: stockLevel(onHand),
      })
    );
  }

  // ─── Auto-Demo Mode ──────────────────────────────────────────

  _startAutoDemo() {
    this._setInterval(() => {
      if (!this._running || !this._isOrchestrator || !this._autoDemoEnabled) return;

      const idle = Date.now() - this._lastOrderTime;
      if (idle > 30000) {
        this._lastOrderTime = Date.now();
        this._placeAutoOrder();
      }
    }, 5000);
  }

  /** Presenter control: fire a demo order immediately (any instance can ask). */
  triggerOrder() {
    this._lastOrderTime = Date.now();
    this._placeAutoOrder();
  }

  _placeAutoOrder() {
    const customer = randomCustomer();
    const items = randomSweets();
    const correlationId = uuid();
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;

    publishMessage(
      MARKETPLACE.ORDER_CREATED,
      envelope('sim-marketplace', correlationId, {
        orderId,
        customer,
        items,
        priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
        source: 'auto-demo',
      })
    );
  }

  // ─── Chaos + SAM (Solace Agent Mesh) ─────────────────────────
  // Presenter injects a disruption; a SAM agent detects it, reasons about
  // it, publishes a corrective action, and closes the incident. The whole
  // timeline is scripted from CHAOS_LIBRARY so it's instant and reliable.

  /** Ms until the chaos button is armed again (0 = ready). */
  chaosCooldownRemaining() {
    const left = this._chaosCooldownMs - (Date.now() - this._lastChaosAt);
    return left > 0 ? left : 0;
  }

  /**
   * Presenter control: inject one disruption (random, or a specific id).
   * Enforces the 5s cooldown and returns false if still cooling down.
   */
  triggerChaos(chaosId = null) {
    if (this.chaosCooldownRemaining() > 0) return false;
    this._lastChaosAt = Date.now();
    const chaos = chaosId
      ? CHAOS_LIBRARY.find((c) => c.id === chaosId) || randomChaos()
      : randomChaos();
    this._injectChaos(chaos);
    return true;
  }

  _injectChaos(chaos) {
    const correlationId = uuid();
    const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
    const agent = agentFor(chaos.id);

    // 1) The faulty event itself — flagged chaos:true so the feed shows red.
    const faultPayload = { ...chaos.inject.payload(), incidentId, chaosId: chaos.id };
    publishMessage(
      chaos.inject.topic,
      envelope(chaos.inject.source || 'chaos-injector', correlationId, faultPayload)
    );

    // 1b) A meta chaos/raised event so the SAM tab & feed can headline it.
    publishMessage(
      CHAOS.RAISED,
      envelope('chaos-injector', correlationId, {
        chaos: true,
        incidentId,
        chaosId: chaos.id,
        label: chaos.label,
        layer: chaos.layer,
        severity: chaos.severity,
        detail: chaos.detect,
      })
    );

    // 2) SAM detects (+600ms) — the agent mesh picks it up.
    this._setTimeout(() => {
      publishMessage(
        SAM.INCIDENT_DETECTED,
        envelope(`sam-${agent.id}`, correlationId, {
          incidentId,
          chaosId: chaos.id,
          agent: agent.id,
          agentName: agent.name,
          label: chaos.label,
          layer: chaos.layer,
          severity: chaos.severity,
          detail: chaos.detect,
        })
      );

      // 3) SAM reasons (+700ms after detect) — one LLM-style line.
      this._setTimeout(() => {
        publishMessage(
          SAM.AGENT_REASONING,
          envelope(`sam-${agent.id}`, correlationId, {
            incidentId,
            chaosId: chaos.id,
            agent: agent.id,
            agentName: agent.name,
            reasoning: chaos.reasoning,
          })
        );

        // 4) SAM acts + resolves (after the agent's "think" time).
        this._setTimeout(() => {
          if (!this._running) return;
          const fixPayload = { ...chaos.fix.payload({ incidentId, correlationId }), incidentId, chaosId: chaos.id, samFix: true };
          publishMessage(
            chaos.fix.topic,
            envelope(chaos.fix.source || `sam-${agent.id}`, correlationId, fixPayload)
          );

          // Announce the concrete action taken, then close the incident.
          publishMessage(
            SAM.ACTION_TAKEN,
            envelope(`sam-${agent.id}`, correlationId, {
              incidentId,
              chaosId: chaos.id,
              agent: agent.id,
              agentName: agent.name,
              action: fixPayload.note || 'Corrective action published',
              actionTopic: chaos.fix.topic,
            })
          );

          this._setTimeout(() => {
            publishMessage(
              SAM.INCIDENT_RESOLVED,
              envelope(`sam-${agent.id}`, correlationId, {
                incidentId,
                chaosId: chaos.id,
                agent: agent.id,
                agentName: agent.name,
                label: chaos.label,
                resolvedMs: chaos.resolveMs,
              })
            );
          }, 400);
        }, chaos.resolveMs);
      }, 700);
    }, 600);
  }
}
