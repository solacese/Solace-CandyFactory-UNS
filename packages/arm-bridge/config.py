"""Configuration for the LeRobot ↔ Solace arm bridge."""

import os
import sys


def _require(var: str) -> str:
    val = os.environ.get(var)
    if not val:
        print(f"ERROR: Required environment variable {var} is not set.", file=sys.stderr)
        sys.exit(1)
    return val


# Solace/MQTT broker
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USERNAME = os.environ.get("MQTT_USERNAME", "haribot")
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "haribot")

# Topic prefix — MUST match the kiosk's UNS root (packages/kiosk/src/constants/
# topics.js). The kiosk subscribes to "candyfactory/>", so the physical arm has
# to publish into that same namespace to appear on the dashboard.
#   candyfactory / <site> / <area> / <line>
ROOT = os.environ.get("UNS_ROOT", "candyfactory")
SITE = os.environ.get("UNS_SITE", "paris")
AREA = os.environ.get("UNS_AREA", "packing")
LINE = os.environ.get("UNS_LINE", "line1")
TOPIC_PREFIX = f"{ROOT}/{SITE}/{AREA}/{LINE}"

# Topics
TOPIC_ARM_COMMAND = f"{TOPIC_PREFIX}/arm/command"
TOPIC_ARM_TELEMETRY = f"{TOPIC_PREFIX}/arm/telemetry"
TOPIC_ARM_STATUS = f"{TOPIC_PREFIX}/arm/status"

# Per-motor telemetry topics — one per SO-101 follower joint, in physical
# order. Mirrors ARM_MOTORS / ARM.MOTOR in the kiosk so each servo is
# independently observable on the UNS (candyfactory/.../arm/<motor>).
ARM_MOTORS = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]
TOPIC_ARM_MOTOR = {m: f"{TOPIC_PREFIX}/arm/{m}" for m in ARM_MOTORS}

# SO-101 arm
ARM_PORT = os.environ.get("ARM_SERIAL_PORT", "/dev/tty.usbmodem5B3D0457761")
ARM_ID = os.environ.get("ARM_ID", "so101")
USE_DEGREES = os.environ.get("ARM_USE_DEGREES", "true").lower() == "true"

# Telemetry
TELEMETRY_HZ = int(os.environ.get("TELEMETRY_HZ", "10"))

# ---------------------------------------------------------------------------
# Physical servo remap
# ---------------------------------------------------------------------------
# The gripper servo (LeRobot ID 6, "gripper") and the wrist-roll servo
# (ID 5, "wrist_roll") were physically swapped on the arm. LeRobot still
# addresses motors by their stored bus ID, so:
#   - The motor now sitting in the GRIPPER position answers to "wrist_roll".
#   - The motor now sitting in the WRIST-ROLL position answers to "gripper".
#
# To make the gripper work while keeping the wrist frozen, we:
#   - Drive gripper open/close via ARM_GRIPPER_MOTOR ("wrist_roll").
#   - Never command any joint in ARM_FROZEN_JOINTS (default "gripper"),
#     so the motor now physically in the wrist stays put.
#
# Revert after swapping the servos back with:
#   ARM_GRIPPER_MOTOR=gripper  ARM_FROZEN_JOINTS=
ARM_GRIPPER_MOTOR = os.environ.get("ARM_GRIPPER_MOTOR", "wrist_roll")
ARM_FROZEN_JOINTS = [
    j.strip() for j in os.environ.get("ARM_FROZEN_JOINTS", "gripper").split(",") if j.strip()
]

# Gripper travel on the actuating motor (0-100 for the real gripper; the
# wrist_roll motor may need different values — tune these live via env).
GRIPPER_OPEN = float(os.environ.get("ARM_GRIPPER_OPEN", "100"))
GRIPPER_CLOSED = float(os.environ.get("ARM_GRIPPER_CLOSED", "0"))
