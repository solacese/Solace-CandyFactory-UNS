"""Command handlers: translate arm/command events into LeRobot actions."""

import logging
import time

import config

logger = logging.getLogger(__name__)

# Home position (degrees) — all joints centered, gripper open.
# Uses config.GRIPPER_OPEN so it survives the gripper→wrist_roll remap.
HOME_POSITION = {
    "shoulder_pan.pos": 0.0,
    "shoulder_lift.pos": 0.0,
    "elbow_flex.pos": 0.0,
    "wrist_flex.pos": 0.0,
    "wrist_roll.pos": 0.0,
    "gripper.pos": config.GRIPPER_OPEN,  # logical gripper; remapped below
}

# Joint name mapping (index → LeRobot motor name)
JOINT_NAMES = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]


def _apply_remap(action: dict) -> dict:
    """
    Translate a logical action dict into what the physically-swapped arm needs.

    1. Redirect the logical "gripper.pos" onto the motor that actually actuates
       the gripper now (config.ARM_GRIPPER_MOTOR, e.g. "wrist_roll").
    2. Drop every joint listed in config.ARM_FROZEN_JOINTS so it is never
       commanded (keeps the displaced motor — now in the wrist — frozen).

    When ARM_GRIPPER_MOTOR == "gripper" and ARM_FROZEN_JOINTS is empty this is
    a no-op, i.e. original behaviour is restored.
    """
    gripper_motor = config.ARM_GRIPPER_MOTOR
    frozen = set(config.ARM_FROZEN_JOINTS)
    remapped_gripper = gripper_motor != "gripper"

    # The gripper is only legitimately driven via a logical "gripper.pos".
    # Any raw reference to the actuating motor as an ARM joint (e.g. wrist_roll
    # in a 6-joint move) must be dropped so arm motion never disturbs the grip.
    has_gripper_intent = "gripper.pos" in action

    remapped = {}
    for key, value in action.items():
        joint = key[:-4] if key.endswith(".pos") else key

        # Drop raw arm-joint writes to the actuating motor (not gripper intent).
        if remapped_gripper and joint == gripper_motor:
            continue

        # Redirect logical gripper onto its real actuating motor.
        if joint == "gripper" and remapped_gripper:
            joint = gripper_motor
            key = f"{gripper_motor}.pos"

        # Never write to frozen joints (e.g. the motor now sitting in the wrist).
        if joint in frozen:
            continue

        remapped[key] = value

    # Guard: if there was no gripper intent, the actuating motor stays untouched.
    if remapped_gripper and not has_gripper_intent:
        remapped.pop(f"{gripper_motor}.pos", None)

    return remapped


def _send(robot, action: dict):
    """Apply the physical remap, then send to the robot."""
    safe = _apply_remap(action)
    logger.debug(f"[cmd] send_action (remapped): {safe}")
    robot.send_action(safe)


def handle_command(robot, command: dict) -> str:
    """
    Process an arm/command event payload and execute on the robot.

    Returns the resulting status string: 'idle', 'executing', or 'fault'.
    """
    command_type = command.get("commandType", "")
    params = command.get("params", {})

    logger.info(f"[cmd] Received: {command_type} params={params}")

    try:
        if command_type == "stop":
            return _emergency_stop(robot)
        elif command_type == "home":
            return _move_home(robot)
        elif command_type == "move-to":
            return _move_to(robot, params)
        elif command_type == "pick":
            return _pick(robot, params)
        elif command_type == "place":
            return _place(robot, params)
        elif command_type == "jog":
            return _jog(robot, params)
        else:
            logger.warning(f"[cmd] Unknown command type: {command_type}")
            return "idle"
    except Exception as e:
        logger.error(f"[cmd] Command failed: {e}")
        return "fault"


def _emergency_stop(robot):
    """Disconnect torque — arm goes limp."""
    logger.warning("[cmd] EMERGENCY STOP")
    try:
        robot.disconnect()
    except Exception:
        pass
    return "fault"


def _move_home(robot):
    """Move all joints to home position."""
    logger.info("[cmd] Moving to home position")
    _send(robot, HOME_POSITION)
    time.sleep(2)  # Wait for motion to complete
    return "idle"


def _move_to(robot, params: dict):
    """
    Move to target joint positions.

    Accepts either:
      - params.joints: [j0, j1, j2, j3, j4, j5] array (degrees)
      - params.target: {x, y, z} (simplified IK — demo only)
    """
    joints = params.get("joints")
    if joints and len(joints) == 6:
        action = {f"{JOINT_NAMES[i]}.pos": float(joints[i]) for i in range(6)}
        _send(robot, action)
        time.sleep(1.5)
        return "idle"

    # If XYZ coords provided, do simplified mapping (same as simulated arm)
    target = params.get("target", {})
    if target:
        action = _coords_to_action(target)
        _send(robot, action)
        time.sleep(1.5)
        return "idle"

    logger.warning("[cmd] move-to: no valid joints or target in params")
    return "idle"


def _hold_and_set_gripper(robot, gripper_value: float) -> dict:
    """
    Build an action that holds the current arm pose and sets the (logical)
    gripper. Raw observed keys for the gripper motor and the remapped target
    motor are dropped so _apply_remap owns the gripper write and frozen joints
    stay untouched.
    """
    obs = robot.get_observation()
    action = {k: v for k, v in obs.items() if k.endswith(".pos")}

    # Drop the raw readings that _apply_remap manages, to avoid double-writing
    # the actuating motor or re-commanding a frozen joint.
    for k in ("gripper.pos", f"{config.ARM_GRIPPER_MOTOR}.pos"):
        action.pop(k, None)

    action["gripper.pos"] = gripper_value  # logical; _apply_remap redirects it
    return action


def _pick(robot, params: dict):
    """Move to position, then close gripper."""
    target = params.get("target", {})
    if target:
        action = _coords_to_action(target)
        _send(robot, action)
        time.sleep(1.5)

    _send(robot, _hold_and_set_gripper(robot, config.GRIPPER_CLOSED))
    time.sleep(1)
    return "idle"


def _place(robot, params: dict):
    """Move to position, then open gripper."""
    target = params.get("target", {})
    if target:
        action = _coords_to_action(target)
        _send(robot, action)
        time.sleep(1.5)

    _send(robot, _hold_and_set_gripper(robot, config.GRIPPER_OPEN))
    time.sleep(1)
    return "idle"


def _jog(robot, params: dict):
    """Jog a single joint by a delta."""
    joint_index = params.get("joint", 0)
    direction = params.get("direction", 1)
    speed = params.get("speed", 10)

    if joint_index < 0 or joint_index >= 6:
        return "idle"

    # Read current position
    obs = robot.get_observation()
    action = {k: v for k, v in obs.items() if k.endswith(".pos")}

    # Apply delta
    joint_key = f"{JOINT_NAMES[joint_index]}.pos"
    current = action.get(joint_key, 0.0)
    action[joint_key] = current + (direction * speed)

    _send(robot, action)
    return "idle"


def _coords_to_action(coords: dict) -> dict:
    """
    Simplified IK: convert {x, y, z} to joint angles.
    This matches the simulated arm's approximation for demo consistency.
    """
    import math

    x = coords.get("x", 0)
    y = coords.get("y", 0)
    z = coords.get("z", 0)

    base_angle = math.atan2(y, x) * (180 / math.pi)
    reach = math.sqrt(x * x + y * y)
    shoulder_angle = max(-90, min(90, (reach / 400) * 60 - 30))
    elbow_angle = max(-90, min(90, (z / 100) * 30))

    action = {
        "shoulder_pan.pos": max(-180, min(180, base_angle)),
        "shoulder_lift.pos": shoulder_angle,
        "elbow_flex.pos": elbow_angle,
        "wrist_flex.pos": 0.0,
    }
    # Do NOT emit wrist_roll here: post-swap that motor actuates the gripper,
    # so arm moves must leave it alone (only pick/place drive the gripper).
    # When not remapped, wrist_roll simply keeps its current position.
    if config.ARM_GRIPPER_MOTOR != "wrist_roll":
        action["wrist_roll.pos"] = 0.0
    return action
