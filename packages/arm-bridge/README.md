# Arm Bridge — LeRobot ↔ Solace

Bridges the physical SO-101 robot arm (via LeRobot) to the Haribot UNS event mesh (via MQTT/Solace).

## What it does

- **Subscribes** to `haribot/paris-demo/packing/line1/arm/command` — receives motion commands
- **Publishes** to `haribot/paris-demo/packing/line1/arm/telemetry` — joint angles at 10Hz
- **Publishes** to `haribot/paris-demo/packing/line1/arm/status` — state changes (idle/executing/fault)

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
| `MQTT_HOST` | `localhost` | Solace broker host |
| `MQTT_PORT` | `1883` | MQTT port |
| `MQTT_USERNAME` | `haribot` | Broker username |
| `MQTT_PASSWORD` | `haribot` | Broker password |
| `ARM_SERIAL_PORT` | `/dev/tty.usbmodem5B3D0457761` | SO-101 follower port |
| `ARM_ID` | `so101` | LeRobot calibration ID |
| `TELEMETRY_HZ` | `10` | Telemetry publish rate |

## Testing without hardware

Send a test command via mosquitto:
```bash
mosquitto_pub -h localhost -p 1883 -u haribot -P haribot \
  -t "haribot/paris-demo/packing/line1/arm/command" \
  -m '{"eventId":"test","source":"manual","payload":{"commandType":"home"}}'
```

Subscribe to telemetry:
```bash
mosquitto_sub -h localhost -p 1883 -u haribot -P haribot \
  -t "haribot/paris-demo/packing/line1/arm/telemetry"
```
