"""Command handlers: translate arm/command events into LeRobot actions."""

import logging
import time

logger = logging.getLogger(__name__)

# Home position (degrees) — all joints centered, gripper open
HOME_POSITION = {
    "shoulder_pan.pos": 0.0,
    "shoulder_lift.pos": 0.0,
    "elbow_flex.pos": 0.0,
    "wrist_flex.pos": 0.0,
    "wrist_roll.pos": 0.0,
    "gripper.pos": 100.0,  # 0-100 range: 100 = fully open
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
    robot.send_action(HOME_POSITION)
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
        robot.send_action(action)
        time.sleep(1.5)
        return "idle"

    # If XYZ coords provided, do simplified mapping (same as simulated arm)
    target = params.get("target", {})
    if target:
        action = _coords_to_action(target)
        robot.send_action(action)
        time.sleep(1.5)
        return "idle"

    logger.warning("[cmd] move-to: no valid joints or target in params")
    return "idle"


def _pick(robot, params: dict):
    """Move to position, then close gripper."""
    target = params.get("target", {})
    if target:
        action = _coords_to_action(target)
        robot.send_action(action)
        time.sleep(1.5)

    # Close gripper
    obs = robot.get_observation()
    action = {k: v for k, v in obs.items() if k.endswith(".pos")}
    action["gripper.pos"] = 0.0  # Closed
    robot.send_action(action)
    time.sleep(1)
    return "idle"


def _place(robot, params: dict):
    """Move to position, then open gripper."""
    target = params.get("target", {})
    if target:
        action = _coords_to_action(target)
        robot.send_action(action)
        time.sleep(1.5)

    # Open gripper
    obs = robot.get_observation()
    action = {k: v for k, v in obs.items() if k.endswith(".pos")}
    action["gripper.pos"] = 100.0  # Open
    robot.send_action(action)
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

    robot.send_action(action)
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

    return {
        "shoulder_pan.pos": max(-180, min(180, base_angle)),
        "shoulder_lift.pos": shoulder_angle,
        "elbow_flex.pos": elbow_angle,
        "wrist_flex.pos": 0.0,
        "wrist_roll.pos": 0.0,
        "gripper.pos": 100.0,  # Keep open by default during moves
    }
