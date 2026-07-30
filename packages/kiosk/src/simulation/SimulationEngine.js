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
import { MARKETPLACE, ERP, MES, SCADA, ARM, SYSTEM } from '../constants/topics.js';
import {
  SENSORS,
  ALARM_TYPES,
  SWEETS,
  nextWorkOrderId,
  randomCustomer,
  randomSweets,
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
    this._currentArmAngles = [0, -30, 45, 0, 0, 0]; // Default resting position
    this._processingOrders = new Map(); // correlationId -> startedAt (watchdog)

    // ─── Leader election: exactly one open kiosk drives the cascade ──
    this._instanceId = uuid();
    this._peers = new Map(); // instanceId -> lastSeenMs
    this._isOrchestrator = false;
    this._autoDemoEnabled = true;
    this._onRoleChange = null; // (isOrchestrator) => void
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

    // MES: production/started
    this._setTimeout(() => {
      publishMessage(
        MES.PRODUCTION_STARTED,
        envelope('sim-mes', correlationId, {
          workOrderId,
          itemCount: items.length,
        })
      );

      // Sequentially process each item
      this._processStepsSequentially(items, correlationId, workOrderId, 0);
    }, 1000);
  }

  _processStepsSequentially(items, correlationId, workOrderId, stepIndex) {
    if (!this._running) return;
    if (stepIndex >= items.length) {
      // All steps done
      this._setTimeout(() => {
        publishMessage(
          MES.PRODUCTION_COMPLETE,
          envelope('sim-mes', correlationId, {
            workOrderId,
            totalSteps: items.length,
          })
        );

        // ERP: work-order/completed
        this._setTimeout(() => {
          publishMessage(
            ERP.WORK_ORDER_COMPLETED,
            envelope('sim-erp', correlationId, {
              workOrderId,
              status: 'completed',
              completedAt: new Date().toISOString(),
            })
          );
          // Clean up tracking
          this._processingOrders.delete(correlationId);
        }, 500);
      }, 800);
      return;
    }

    const item = items[stepIndex];
    const sweet = SWEETS.find((s) => s.id === item.sweetType) || SWEETS[0];
    const stepName = `pick-${item.sweetType}`;

    // MES: step-begun
    publishMessage(
      MES.PRODUCTION_STEP_BEGUN,
      envelope('sim-mes', correlationId, {
        workOrderId,
        stepIndex,
        stepName,
        sweetType: item.sweetType,
        quantity: item.quantity,
      })
    );

    // ARM: command (+500ms)
    this._setTimeout(() => {
      publishMessage(
        ARM.COMMAND,
        envelope('sim-arm', correlationId, {
          commandType: 'pick',
          params: {
            target: sweet.name,
            bin: sweet.bin,
            quantity: item.quantity,
          },
        })
      );

      // HITL: approval-required (only for first pick of each order)
      if (stepIndex === 0) {
        this._setTimeout(() => {
          publishMessage(
            ARM.HITL_REQUIRED,
            envelope('sim-arm', correlationId, {
              action: `Pick ${item.quantity}x ${sweet.name} from Bin ${sweet.bin}`,
              commandType: 'pick',
              target: sweet.name,
              reason: 'First pick in new work order requires operator approval',
            })
          );
        }, 200);
      }

      // ARM: telemetry — simulate motion over ~2s
      this._simulateArmMotion(correlationId, sweet.bin);

      // ARM: status idle (+2500ms) → step-complete (+3000ms)
      this._setTimeout(() => {
        publishMessage(
          ARM.STATUS,
          envelope('sim-arm', correlationId, {
            status: 'idle',
            detail: `Completed pick of ${sweet.name}`,
          })
        );
      }, 2500);

      this._setTimeout(() => {
        publishMessage(
          MES.PRODUCTION_STEP_COMPLETE,
          envelope('sim-mes', correlationId, {
            workOrderId,
            stepIndex,
            stepName,
          })
        );

        // Quality check after step
        this._setTimeout(() => {
          const pass = Math.random() < 0.95;
          publishMessage(
            MES.QUALITY_CHECK,
            envelope('sim-mes', correlationId, {
              workOrderId,
              stepIndex,
              result: pass ? 'pass' : 'fail',
              confidence: pass ? 0.97 + Math.random() * 0.03 : 0.4 + Math.random() * 0.3,
              checkType: 'weight-verification',
            })
          );

          // Next step
          this._processStepsSequentially(items, correlationId, workOrderId, stepIndex + 1);
        }, 400);
      }, 3000);
    }, 500);
  }

  // ─── Arm Motion Simulation ───────────────────────────────────

  _simulateArmMotion(correlationId, binIndex) {
    // Target angles based on bin position
    const targets = this._getTargetAngles(binIndex);
    const startAngles = [...this._currentArmAngles];
    const steps = 10; // 10 steps over 2s = 200ms apart

    // Publish executing status
    publishMessage(
      ARM.STATUS,
      envelope('sim-arm', correlationId, {
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
            jointAngles: angles,
            gripperState: t < 0.7 ? 'open' : 'closed',
          })
        );
      }, i * 200);
    }
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

  // ─── Background: Sensor Readings ─────────────────────────────

  _startBackgroundSensors() {
    this._setInterval(() => {
      if (!this._running) return;

      const sensor = SENSORS[this._sensorIndex];
      this._sensorIndex = (this._sensorIndex + 1) % SENSORS.length;

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

      // Random chance of alarm (3%)
      if (Math.random() < 0.03) {
        const alarm = ALARM_TYPES[Math.floor(Math.random() * ALARM_TYPES.length)];
        publishMessage(
          SCADA.ALARM_RAISED,
          envelope('sim-scada', null, {
            alarmCode: alarm.code,
            message: alarm.message,
            severity: alarm.severity,
            sensor: alarm.sensor,
            triggeredValue: value,
          })
        );
      }
    }, 2000);
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
    }, 3000);
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

      publishMessage(
        MES.OEE_UPDATE,
        envelope('sim-mes', null, {
          availability: +this._oeeValues.availability.toFixed(1),
          performance: +this._oeeValues.performance.toFixed(1),
          quality: +this._oeeValues.quality.toFixed(1),
          oee: +oee.toFixed(1),
        })
      );
    }, 5000);
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
}
