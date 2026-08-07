"""Telemetry publisher: reads joint positions from SO-101 and publishes at configurable Hz."""

import json
import logging
import threading
import time
import uuid

import config

logger = logging.getLogger(__name__)


class TelemetryPublisher:
    """Reads robot state and publishes to MQTT at a fixed rate."""

    def __init__(self, robot, mqtt_client, topic: str, hz: int = 10):
        self.robot = robot
        self.mqtt_client = mqtt_client
        self.topic = topic
        self.hz = hz
        self._running = False
        self._thread = None

    def start(self):
        """Start publishing telemetry in a background thread."""
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info(f"[telemetry] Publishing at {self.hz}Hz to {self.topic}")

    def stop(self):
        """Stop the telemetry loop."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("[telemetry] Stopped")

    def _loop(self):
        interval = 1.0 / self.hz
        while self._running:
            try:
                start = time.perf_counter()
                self._publish_once()
                elapsed = time.perf_counter() - start
                sleep_time = max(0, interval - elapsed)
                time.sleep(sleep_time)
            except Exception as e:
                logger.error(f"[telemetry] Error: {e}")
                time.sleep(0.5)

    def _publish_once(self):
        """Read robot observation and publish as telemetry event."""
        try:
            obs = self.robot.get_observation()
        except Exception as e:
            logger.debug(f"[telemetry] Could not read observation: {e}")
            return

        # Extract joint positions (skip camera data). Keep the canonical ISA
        # 6-slot order for the dashboard's jointAngles array.
        joint_angles = []
        for key in [
            "shoulder_pan.pos",
            "shoulder_lift.pos",
            "elbow_flex.pos",
            "wrist_flex.pos",
            "wrist_roll.pos",
            "gripper.pos",
        ]:
            joint_angles.append(obs.get(key, 0.0))

        # Gripper state must come from the motor that PHYSICALLY actuates the
        # gripper (post-swap that's config.ARM_GRIPPER_MOTOR, e.g. wrist_roll),
        # not the logical "gripper" motor which now sits frozen in the wrist.
        gripper_value = obs.get(f"{config.ARM_GRIPPER_MOTOR}.pos", joint_angles[5])
        midpoint = (config.GRIPPER_OPEN + config.GRIPPER_CLOSED) / 2.0
        gripper_state = "open" if gripper_value > midpoint else "closed"

        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        # Combined telemetry — the whole pose in one event (drives the 3D arm
        # and the joint-bar panel in the kiosk).
        event = {
            "eventId": str(uuid.uuid4()),
            "timestamp": timestamp,
            "source": "arm-bridge",
            "payload": {
                "jointAngles": joint_angles,
                "gripperState": gripper_state,
            },
        }
        self.mqtt_client.publish(self.topic, json.dumps(event))

        # Per-motor telemetry — one event per SO-101 joint on its own topic
        # (candyfactory/.../arm/<motor>), mirroring the sim so each servo is
        # independently subscribable on the UNS. source=arm-bridge lets the
        # kiosk tell real telemetry apart from the browser simulation.
        for idx, motor in enumerate(config.ARM_MOTORS):
            motor_topic = config.TOPIC_ARM_MOTOR.get(motor)
            if not motor_topic:
                continue
            motor_event = {
                "eventId": str(uuid.uuid4()),
                "timestamp": timestamp,
                "source": "arm-bridge",
                "payload": {
                    "motor": motor,
                    "jointIndex": idx,
                    "angleDeg": joint_angles[idx],
                    "unit": "deg",
                },
            }
            self.mqtt_client.publish(motor_topic, json.dumps(motor_event))
