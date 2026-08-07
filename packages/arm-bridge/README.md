# Arm Bridge — LeRobot ↔ Solace

Bridges the physical SO-101 robot arm (via LeRobot) to the CandyFactory UNS event mesh (via MQTT/Solace).

## What it does

- **Subscribes** to `candyfactory/paris/packing/line1/arm/command` — receives motion commands
- **Publishes** to `candyfactory/paris/packing/line1/arm/telemetry` — combined joint angles at 10Hz
- **Publishes** to `candyfactory/paris/packing/line1/arm/<motor>` — one event **per motor** at 10Hz
  (`shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`)
- **Publishes** to `candyfactory/paris/packing/line1/arm/status` — state changes (idle/executing/fault)

Every event carries `source: "arm-bridge"`. The kiosk uses that marker to switch
its ARM tab into **live** mode (badge turns red, 3D arm follows real joints) and
its simulation engine **auto-yields** — it stops emitting fake arm telemetry while
the physical arm is publishing (times out ~4s after the last real event).

## Commands supported

| commandType | params | Description |
|-------------|--------|-------------|
| `home` | — | Move all joints to center, gripper open |
| `move-to` | `{joints: [j0..j5]}` or `{target: {x,y,z}}` | Move to joint angles or XYZ |
| `pick` | `{target: {x,y,z}}` | Move to position, close gripper |
| `place` | `{target: {x,y,z}}` | Move to position, open gripper |
| `jog` | `{joint: 0-5, direction: ±1, speed: deg}` | Nudge a single joint |
| `stop` | — | Emergency stop (disables torque) |

## Setup

```bash
# Use the LeRobot venv (has all motor dependencies)
source ~/lerobot/.venv/bin/activate

# Install MQTT client
pip install paho-mqtt

# Run
cd packages/arm-bridge
python bridge.py
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UNS_ROOT` | `candyfactory` | Namespace root (topic prefix segment 1) |
| `UNS_SITE` | `paris` | Site segment |
| `UNS_AREA` | `packing` | Area segment |
| `UNS_LINE` | `line1` | Line segment |
| `MQTT_HOST` | `localhost` | Solace broker host |
| `MQTT_PORT` | `1883` | MQTT port |
| `MQTT_USERNAME` | `haribot` | Broker username |
| `MQTT_PASSWORD` | `haribot` | Broker password |
| `ARM_SERIAL_PORT` | `/dev/tty.usbmodem5B3D0457761` | SO-101 follower port |
| `ARM_ID` | `so101` | LeRobot calibration ID |
| `TELEMETRY_HZ` | `10` | Telemetry publish rate |
| `ARM_GRIPPER_MOTOR` | `wrist_roll` | Motor that physically actuates the gripper (post servo-swap) |
| `ARM_FROZEN_JOINTS` | `gripper` | Comma-separated joints that are never commanded (kept frozen) |
| `ARM_GRIPPER_OPEN` | `100` | Actuating-motor value for a fully open gripper |
| `ARM_GRIPPER_CLOSED` | `0` | Actuating-motor value for a fully closed gripper |

### Servo remap (gripper ↔ wrist_roll swapped)

The gripper servo (LeRobot ID 6) and the wrist-roll servo (ID 5) were
physically swapped on the arm. LeRobot addresses motors by their stored bus
ID, so the bridge remaps at the logical layer instead of re-flashing servos:

- Gripper open/close is driven via **`wrist_roll`** (`ARM_GRIPPER_MOTOR`).
- The `gripper` motor — now sitting in the wrist — is **frozen**
  (`ARM_FROZEN_JOINTS=gripper`) and never commanded.
- Arm-motion commands (`home`, `move-to`, IK) never write the actuating
  motor; only `pick`/`place` (and an explicit gripper value in a 6-joint
  `move-to`) drive it.

**To revert after swapping the servos back:**

```bash
ARM_GRIPPER_MOTOR=gripper ARM_FROZEN_JOINTS= python bridge.py
```

Tune `ARM_GRIPPER_OPEN` / `ARM_GRIPPER_CLOSED` live if the wrist_roll motor's
travel differs from the original gripper's 0–100 range.

## Local run with live kiosk visualization

Full loop on one machine: **local Solace broker → arm-bridge (or a smoke-test
publisher) → kiosk ARM tab shows live joint positions.**

### 1. Start a local Solace broker

From the repo root:
```bash
docker compose -f docker-compose.solace.yml up -d
# wait ~30s for the broker to come up, then create the client user:
curl -s -X POST -u admin:admin http://localhost:8080/SEMP/v2/config/msgVpns/default/clientUsernames \
  -H 'Content-Type: application/json' \
  -d '{"clientUsername":"haribot","password":"haribot","enabled":true}'
```
The broker exposes MQTT on `:1883` (arm-bridge) and WebSocket SMF on `:8008`
(kiosk) over the same topic space.

### 2. Run the kiosk against the local broker (non-loopback)

```bash
cd packages/kiosk
cp .env.local.example .env.local   # points VITE_SOLACE_HOST at ws://localhost:8008
npm install
npm run dev                          # http://localhost:5173 — open the ARM tab
```
> Do **not** set `VITE_LOOPBACK=1` for a local broker run — that's only for the
> hardware-free GitHub Pages build.

### 3a. With the physical arm

```bash
source ~/lerobot/.venv/bin/activate
cd packages/arm-bridge
python bridge.py
```
The ARM tab badge flips to **● live so-101** and the 3D arm follows the real joints.

### 3b. Without hardware — smoke test

Drive the live viz with a synthetic per-motor stream (no arm required):
```bash
# sweep shoulder_pan and mark it as coming from the bridge
for a in 0 15 30 45 30 15 0 -15 -30 -15 0; do
  mosquitto_pub -h localhost -p 1883 -u haribot -P haribot \
    -t "candyfactory/paris/packing/line1/arm/shoulder_pan" \
    -m "{\"eventId\":\"t\",\"timestamp\":\"$(date -u +%FT%TZ)\",\"source\":\"arm-bridge\",\"payload\":{\"motor\":\"shoulder_pan\",\"jointIndex\":0,\"angleDeg\":$a,\"unit\":\"deg\"}}"
  sleep 0.2
done
```
Because these carry `source: "arm-bridge"`, the kiosk switches to live mode and
the simulation engine stops emitting its own arm telemetry.

## Testing commands without hardware

Send a test command via mosquitto:
```bash
mosquitto_pub -h localhost -p 1883 -u haribot -P haribot \
  -t "candyfactory/paris/packing/line1/arm/command" \
  -m '{"eventId":"test","source":"manual","payload":{"commandType":"home"}}'
```

Subscribe to telemetry:
```bash
mosquitto_sub -h localhost -p 1883 -u haribot -P haribot \
  -t "candyfactory/paris/packing/line1/arm/#"
```
