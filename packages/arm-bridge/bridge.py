#!/usr/bin/env python3
"""
LeRobot ↔ Solace Arm Bridge

Connects to a real SO-101 follower arm via LeRobot and bridges
commands/telemetry through Solace PubSub+ (MQTT).

Subscribes to: candyfactory/{site}/{area}/{line}/arm/command
Publishes to:  candyfactory/{site}/{area}/{line}/arm/telemetry (10Hz)
               candyfactory/{site}/{area}/{line}/arm/<motor>   (per-joint, 10Hz)
               candyfactory/{site}/{area}/{line}/arm/status    (on change)
"""

import json
import logging
import signal
import sys
import time
import uuid

import paho.mqtt.client as mqtt

import config
from commands import handle_command
from telemetry import TelemetryPublisher

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("arm-bridge")

# Global state
robot = None
mqtt_client = None
telemetry_pub = None
current_status = "idle"


def publish_status(status: str, detail: str = ""):
    """Publish arm status change to broker."""
    global current_status
    if status == current_status:
        return
    current_status = status
    event = {
        "eventId": str(uuid.uuid4()),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "source": "arm-bridge",
        "payload": {
            "status": status,
            "detail": detail or f"Arm is {status}",
        },
    }
    mqtt_client.publish(config.TOPIC_ARM_STATUS, json.dumps(event))
    logger.info(f"[status] → {status}")


def on_connect(client, userdata, flags, reason_code, properties=None):
    """Called when MQTT connection is established."""
    if reason_code == 0:
        logger.info(f"[mqtt] Connected to {config.MQTT_HOST}:{config.MQTT_PORT}")
        client.subscribe(config.TOPIC_ARM_COMMAND)
        logger.info(f"[mqtt] Subscribed to {config.TOPIC_ARM_COMMAND}")
        publish_status("idle", "Arm bridge connected and ready")
    else:
        logger.error(f"[mqtt] Connection failed: {reason_code}")


def on_message(client, userdata, msg):
    """Handle incoming arm/command messages."""
    global current_status
    try:
        payload = json.loads(msg.payload.decode())
        command = payload.get("payload", payload)  # Support wrapped or unwrapped

        publish_status("executing")
        new_status = handle_command(robot, command)
        publish_status(new_status)

    except json.JSONDecodeError as e:
        logger.error(f"[mqtt] Invalid JSON: {e}")
    except Exception as e:
        logger.error(f"[mqtt] Command handling error: {e}")
        publish_status("fault", str(e))


def connect_robot():
    """Connect to the SO-101 follower arm via LeRobot.

    Uses the current LeRobot API (SO101Follower / SO101FollowerConfig from
    lerobot.robots.so_follower). `use_degrees` is passed only if this build of
    LeRobot's config accepts it, so the bridge works across versions.
    """
    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

    cfg_kwargs = dict(
        port=config.ARM_PORT,
        id=config.ARM_ID,
        cameras={},  # No cameras for bridge mode
    )
    # Older/newer configs differ on whether they expose `use_degrees`.
    try:
        if "use_degrees" in SO101FollowerConfig.__dataclass_fields__:
            cfg_kwargs["use_degrees"] = config.USE_DEGREES
    except Exception:
        pass

    robot_config = SO101FollowerConfig(**cfg_kwargs)
    arm = SO101Follower(robot_config)
    arm.connect()
    logger.info(f"[robot] SO-101 connected on {config.ARM_PORT}")
    return arm


def connect_mqtt():
    """Connect to Solace/MQTT broker."""
    client = mqtt.Client(
        client_id=f"arm-bridge-{uuid.uuid4().hex[:8]}",
        protocol=mqtt.MQTTv5,
    )
    client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(config.MQTT_HOST, config.MQTT_PORT)
    return client


def shutdown(signum=None, frame=None):
    """Graceful shutdown."""
    logger.info("[bridge] Shutting down...")
    if telemetry_pub:
        telemetry_pub.stop()
    if mqtt_client:
        publish_status("offline", "Arm bridge disconnecting")
        mqtt_client.disconnect()
    if robot:
        try:
            robot.disconnect()
        except Exception:
            pass
    logger.info("[bridge] Bye!")
    sys.exit(0)


def main():
    global robot, mqtt_client, telemetry_pub

    print(
        """
    ╔══════════════════════════════════════════════════╗
    ║  LeRobot ↔ Solace Arm Bridge                    ║
    ║  SO-101 Follower → MQTT → CandyFactory UNS     ║
    ╚══════════════════════════════════════════════════╝
    """
    )

    # Register signal handlers
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # 1. Connect to robot
    logger.info(f"[bridge] Connecting to SO-101 on {config.ARM_PORT}...")
    robot = connect_robot()

    # 2. Connect to MQTT broker
    logger.info(f"[bridge] Connecting to MQTT {config.MQTT_HOST}:{config.MQTT_PORT}...")
    mqtt_client = connect_mqtt()

    # 3. Start telemetry publisher
    telemetry_pub = TelemetryPublisher(
        robot=robot,
        mqtt_client=mqtt_client,
        topic=config.TOPIC_ARM_TELEMETRY,
        hz=config.TELEMETRY_HZ,
    )
    telemetry_pub.start()

    # 4. Run MQTT event loop (blocking)
    logger.info("[bridge] Running — Ctrl+C to stop")
    mqtt_client.loop_forever()


if __name__ == "__main__":
    main()
