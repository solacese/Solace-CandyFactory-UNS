"""
Packing Agent Tools.

The Packing Agent sequences the physical pack job and publishes
pack-job/sequenced and pack-job/status to the UNS.
"""
import logging
from typing import Any, Optional

from google.adk.tools import ToolContext

from src.tools.broker_helper import (
    publish_event,
    TOPIC_PACK_JOB_SEQUENCED,
    TOPIC_PACK_JOB_STATUS,
)

log = logging.getLogger(__name__)

# Fixed bin positions for each sweet type (simulates physical layout)
BIN_POSITIONS = {
    "goldbears": {"bin": 1, "x": 100, "y": 0, "z": 50},
    "happy-cola": {"bin": 2, "x": 200, "y": 0, "z": 50},
    "starmix": {"bin": 3, "x": 300, "y": 0, "z": 50},
    "tangfastics": {"bin": 4, "x": 100, "y": 150, "z": 50},
    "strawbs": {"bin": 5, "x": 200, "y": 150, "z": 50},
    "rings": {"bin": 6, "x": 300, "y": 150, "z": 50},
}

# Drop-off position (output tray)
DROP_POSITION = {"x": 200, "y": 300, "z": 50}


async def sequence_pack_job(
    items: list,
    correlation_id: str,
    customer_name: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Sequence a pack job for the robot arm.

    Determines the optimal pick order based on bin positions (nearest-first
    from home position at origin) and creates a step-by-step sequence.

    Args:
        items: List of items to pack, each with 'sweetType' and 'quantity'.
        correlation_id: The correlation ID for this order lifecycle.
        customer_name: The customer name for reference.

    Returns:
        A dictionary with the sequenced pack job details.
    """
    log.info(f"[PackingAgent] Sequencing pack job for {customer_name}, correlationId={correlation_id[:8]}")

    # Build pick sequence: expand items by quantity, sort by distance from origin
    picks = []
    for item in items:
        sweet_type = item["sweetType"]
        quantity = item["quantity"]
        pos = BIN_POSITIONS.get(sweet_type, BIN_POSITIONS["goldbears"])

        for i in range(quantity):
            picks.append({
                "sweetType": sweet_type,
                "pickNumber": len(picks) + 1,
                "binPosition": pos["bin"],
                "pickCoords": {"x": pos["x"], "y": pos["y"], "z": pos["z"]},
                "dropCoords": DROP_POSITION,
            })

    # Sort by distance from origin (nearest-first strategy)
    picks.sort(key=lambda p: (p["pickCoords"]["x"] ** 2 + p["pickCoords"]["y"] ** 2) ** 0.5)

    # Renumber after sorting
    for i, pick in enumerate(picks):
        pick["pickNumber"] = i + 1

    sequence_payload = {
        "customerName": customer_name,
        "sequence": picks,
        "totalPicks": len(picks),
        "status": "sequenced",
    }

    event = publish_event(TOPIC_PACK_JOB_SEQUENCED, "packing-agent", correlation_id, sequence_payload)
    log.info(f"[PackingAgent] SEQUENCED: {len(picks)} picks for {customer_name}")

    return {
        "status": "sequenced",
        "message": f"Pack job sequenced: {len(picks)} picks planned",
        "totalPicks": len(picks),
        "sequence": picks,
        "eventId": event["eventId"],
        "topic": TOPIC_PACK_JOB_SEQUENCED,
    }


async def update_pack_status(
    correlation_id: str,
    status: str,
    detail: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Publish a pack job status update.

    Args:
        correlation_id: The correlation ID for this order lifecycle.
        status: Current status (in-progress, pick-N, complete, failed).
        detail: Human-readable status detail.

    Returns:
        A dictionary confirming the status update was published.
    """
    payload = {"status": status, "detail": detail}
    event = publish_event(TOPIC_PACK_JOB_STATUS, "packing-agent", correlation_id, payload)
    log.info(f"[PackingAgent] STATUS: {status} - {detail}")

    return {
        "status": "published",
        "packStatus": status,
        "detail": detail,
        "eventId": event["eventId"],
    }
