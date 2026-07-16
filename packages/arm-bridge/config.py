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

# Topic prefix
SITE = os.environ.get("HARIBOT_SITE", "paris-demo")
AREA = os.environ.get("HARIBOT_AREA", "packing")
LINE = os.environ.get("HARIBOT_LINE", "line1")
TOPIC_PREFIX = f"haribot/{SITE}/{AREA}/{LINE}"

# Topics
TOPIC_ARM_COMMAND = f"{TOPIC_PREFIX}/arm/command"
TOPIC_ARM_TELEMETRY = f"{TOPIC_PREFIX}/arm/telemetry"
TOPIC_ARM_STATUS = f"{TOPIC_PREFIX}/arm/status"

# SO-101 arm
ARM_PORT = os.environ.get("ARM_SERIAL_PORT", "/dev/tty.usbmodem5B3D0457761")
ARM_ID = os.environ.get("ARM_ID", "so101")
USE_DEGREES = os.environ.get("ARM_USE_DEGREES", "true").lower() == "true"

# Telemetry
TELEMETRY_HZ = int(os.environ.get("TELEMETRY_HZ", "10"))
