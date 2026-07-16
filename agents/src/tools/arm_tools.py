"""
Arm Control Agent Tools.

The Arm Control Agent plans motion, requests HITL approval,
and only after approval, publishes arm/command.

SAFETY: execute_motion CANNOT publish arm/command without a prior
hitl/approved event with matching correlationId. This is enforced in code.
"""
import logging
import time
import json
from typing import Any, Optional

from google.adk.tools import ToolContext

from src.tools.broker_helper import (
    publish_event,
    TOPIC_ARM_COMMAND,
    TOPIC_HITL_APPROVAL_REQUIRED,
    TOPIC_PACK_JOB_STATUS,
)

log = logging.getLogger(__name__)

# In-memory store of approved correlation IDs (hard gate)
_approved_correlations: set = set()


def mark_approved(correlation_id: str):
    """Called by the event bridge when hitl/approved is received."""
    _approved_correlations.add(correlation_id)
    log.info(f"[ArmAgent] HITL approved for correlationId={correlation_id[:8]}")


def is_approved(correlation_id: str) -> bool:
    """Check if a correlation ID has been approved."""
    return correlation_id in _approved_correlations


async def plan_motion(
    sequence: list,
    correlation_id: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Plan the arm motion for a pick-and-place sequence.

    Converts the pick sequence into a series of joint-space moves:
    home -> pick position -> grip -> lift -> drop position -> release -> repeat

    Args:
        sequence: List of picks from the pack-job/sequenced event.
        correlation_id: The correlation ID for this order lifecycle.

    Returns:
        A dictionary with the planned motion steps.
    """
    log.info(f"[ArmAgent] Planning motion for {len(sequence)} picks, correlationId={correlation_id[:8]}")

    motion_plan = []
    for pick in sequence:
        pick_coords = pick.get("pickCoords", {})
        drop_coords = pick.get("dropCoords", {})

        motion_plan.extend([
            {"action": "move-to", "target": pick_coords, "label": f"Approach bin {pick.get('binPosition', '?')}"},
            {"action": "pick", "target": pick_coords, "label": f"Pick {pick.get('sweetType', 'item')}"},
            {"action": "move-to", "target": drop_coords, "label": "Move to drop zone"},
            {"action": "place", "target": drop_coords, "label": f"Place {pick.get('sweetType', 'item')}"},
        ])

    motion_plan.append({"action": "home", "target": {"x": 0, "y": 0, "z": 0}, "label": "Return home"})

    return {
        "status": "planned",
        "totalSteps": len(motion_plan),
        "totalPicks": len(sequence),
        "motionPlan": motion_plan,
        "message": f"Motion planned: {len(motion_plan)} steps for {len(sequence)} picks",
    }


async def request_hitl_approval(
    motion_plan: list,
    correlation_id: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Request human-in-the-loop approval before executing arm motion.

    Publishes hitl/approval-required and returns immediately.
    The operator must approve via the dashboard before execute_motion will work.

    Args:
        motion_plan: The planned motion steps to show the operator.
        correlation_id: The correlation ID for this order lifecycle.

    Returns:
        A dictionary indicating approval has been requested.
    """
    log.info(f"[ArmAgent] Requesting HITL approval, correlationId={correlation_id[:8]}")

    payload = {
        "plannedMotion": {
            "totalSteps": len(motion_plan),
            "summary": f"{len(motion_plan)} motion steps planned",
            "steps": motion_plan[:5],  # Show first 5 steps as preview
        },
        "reason": "Physical arm motion requires human approval before execution",
        "status": "awaiting-approval",
    }

    event = publish_event(TOPIC_HITL_APPROVAL_REQUIRED, "arm-agent", correlation_id, payload)

    return {
        "status": "awaiting-approval",
        "message": "HITL approval requested. Waiting for operator to approve on the dashboard.",
        "eventId": event["eventId"],
    }


async def execute_motion(
    motion_plan: list,
    correlation_id: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Execute the planned arm motion by publishing arm/command events.

    SAFETY GATE: This tool will REFUSE to execute if no matching hitl/approved
    event has been received for this correlationId. This is enforced in code,
    not just in the agent's prompt.

    Args:
        motion_plan: The planned motion steps to execute.
        correlation_id: The correlation ID for this order lifecycle.

    Returns:
        A dictionary with execution result. Fails if not approved.
    """
    # ═══════════════════════════════════════════════════════════════
    # HARD SAFETY GATE - cannot be bypassed by prompt injection
    # ═══════════════════════════════════════════════════════════════
    if not is_approved(correlation_id):
        log.warning(f"[ArmAgent] BLOCKED: execute_motion called without approval for {correlation_id[:8]}")
        return {
            "status": "blocked",
            "error": "SAFETY GATE: Cannot execute motion without HITL approval. "
                     "A hitl/approved event with matching correlationId must be received first. "
                     "Please call request_hitl_approval first and wait for operator approval.",
        }

    log.info(f"[ArmAgent] Executing motion ({len(motion_plan)} steps), correlationId={correlation_id[:8]}")

    # Publish status update
    publish_event(TOPIC_PACK_JOB_STATUS, "arm-agent", correlation_id, {
        "status": "executing",
        "detail": f"Arm executing {len(motion_plan)} motion steps",
    })

    # Publish arm commands for each step
    for i, step in enumerate(motion_plan):
        command_payload = {
            "commandType": step["action"],
            "params": {
                "target": step.get("target"),
                "stepNumber": i + 1,
                "totalSteps": len(motion_plan),
                "label": step.get("label", ""),
            },
        }
        publish_event(TOPIC_ARM_COMMAND, "arm-agent", correlation_id, command_payload)

    # Publish completion
    publish_event(TOPIC_PACK_JOB_STATUS, "arm-agent", correlation_id, {
        "status": "complete",
        "detail": f"All {len(motion_plan)} motion steps published",
    })

    # Clean up approval (one-time use)
    _approved_correlations.discard(correlation_id)

    return {
        "status": "executed",
        "message": f"Motion executed: {len(motion_plan)} commands published to arm",
        "totalCommands": len(motion_plan),
    }
