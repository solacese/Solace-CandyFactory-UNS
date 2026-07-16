"""
Order Agent Tools.

The Order Agent validates incoming orders and publishes either
orders/validated or orders/rejected to the UNS.
"""
import logging
from typing import Any, Optional

from google.adk.tools import ToolContext

from src.tools.broker_helper import (
    publish_event,
    TOPIC_ORDER_VALIDATED,
    TOPIC_ORDER_REJECTED,
)

log = logging.getLogger(__name__)

# Allowed sweet types
ALLOWED_SWEET_TYPES = [
    "goldbears",
    "happy-cola",
    "starmix",
    "tangfastics",
    "strawbs",
    "rings",
]

MAX_ORDER_QUANTITY = 10
MAX_ITEMS_PER_ORDER = 5


async def validate_order(
    customer_name: str,
    items: list,
    correlation_id: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Validate a customer order and publish the result to the UNS.

    Checks:
    - Customer name is not empty
    - All sweet types are in the allowed list
    - Quantities are between 1 and 10
    - Maximum 5 different items per order

    Args:
        customer_name: The name of the customer who placed the order.
        items: List of items, each with 'sweetType' and 'quantity' keys.
        correlation_id: The correlation ID linking this order through its lifecycle.

    Returns:
        A dictionary with validation result and the published event details.
    """
    log.info(f"[OrderAgent] Validating order for {customer_name}, correlationId={correlation_id[:8]}")

    # Validation checks
    reasons = []

    if not customer_name or not customer_name.strip():
        reasons.append("Customer name is empty")

    if not items or len(items) == 0:
        reasons.append("No items in order")
    elif len(items) > MAX_ITEMS_PER_ORDER:
        reasons.append(f"Too many different items: {len(items)} (max {MAX_ITEMS_PER_ORDER})")
    else:
        for item in items:
            sweet_type = item.get("sweetType", "")
            quantity = item.get("quantity", 0)

            if sweet_type not in ALLOWED_SWEET_TYPES:
                reasons.append(f"Unknown sweet type: '{sweet_type}'. Allowed: {', '.join(ALLOWED_SWEET_TYPES)}")

            if not isinstance(quantity, int) or quantity < 1:
                reasons.append(f"Invalid quantity for {sweet_type}: {quantity} (must be >= 1)")
            elif quantity > MAX_ORDER_QUANTITY:
                reasons.append(f"Quantity too high for {sweet_type}: {quantity} (max {MAX_ORDER_QUANTITY})")

    # Publish result
    if reasons:
        reason_text = "; ".join(reasons)
        payload = {
            "customerName": customer_name,
            "items": items,
            "status": "rejected",
            "reason": reason_text,
        }
        event = publish_event(TOPIC_ORDER_REJECTED, "order-agent", correlation_id, payload)
        log.info(f"[OrderAgent] REJECTED: {reason_text}")
        return {
            "status": "rejected",
            "reason": reason_text,
            "eventId": event["eventId"],
            "topic": TOPIC_ORDER_REJECTED,
        }
    else:
        payload = {
            "customerName": customer_name,
            "items": items,
            "status": "validated",
        }
        event = publish_event(TOPIC_ORDER_VALIDATED, "order-agent", correlation_id, payload)
        log.info(f"[OrderAgent] VALIDATED: {customer_name}")
        return {
            "status": "validated",
            "message": f"Order for {customer_name} validated successfully",
            "eventId": event["eventId"],
            "topic": TOPIC_ORDER_VALIDATED,
        }
