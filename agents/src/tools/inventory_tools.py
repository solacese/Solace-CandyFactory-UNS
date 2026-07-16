"""
Inventory Agent Tools.

The Inventory Agent checks and reserves stock, then publishes
inventory/reserved or inventory/insufficient to the UNS.
"""
import logging
from typing import Any, Optional

from google.adk.tools import ToolContext

from src.db.inventory import reserve_stock, get_stock
from src.tools.broker_helper import (
    publish_event,
    TOPIC_INVENTORY_RESERVED,
    TOPIC_INVENTORY_INSUFFICIENT,
)

log = logging.getLogger(__name__)


async def check_and_reserve_inventory(
    items: list,
    correlation_id: str,
    customer_name: str,
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Check inventory availability and reserve stock for a validated order.

    Attempts to decrement stock atomically. If any item has insufficient stock,
    the entire reservation fails and no stock is decremented.

    Args:
        items: List of items to reserve, each with 'sweetType' and 'quantity'.
        correlation_id: The correlation ID for this order lifecycle.
        customer_name: The customer name (for logging/reference).

    Returns:
        A dictionary with the reservation result and published event details.
    """
    log.info(f"[InventoryAgent] Checking stock for {customer_name}, correlationId={correlation_id[:8]}")

    success, result = reserve_stock(correlation_id, items)

    if success:
        payload = {
            "items": items,
            "remainingStock": result["remainingStock"],
            "status": "reserved",
        }
        event = publish_event(TOPIC_INVENTORY_RESERVED, "inventory-agent", correlation_id, payload)
        log.info(f"[InventoryAgent] RESERVED for {customer_name}")
        return {
            "status": "reserved",
            "message": f"Stock reserved for {customer_name}",
            "remainingStock": result["remainingStock"],
            "eventId": event["eventId"],
            "topic": TOPIC_INVENTORY_RESERVED,
        }
    else:
        payload = {
            "items": items,
            "availableStock": result["availableStock"],
            "status": "insufficient",
            "reason": result["reason"],
        }
        event = publish_event(TOPIC_INVENTORY_INSUFFICIENT, "inventory-agent", correlation_id, payload)
        log.info(f"[InventoryAgent] INSUFFICIENT: {result['reason']}")
        return {
            "status": "insufficient",
            "reason": result["reason"],
            "availableStock": result["availableStock"],
            "eventId": event["eventId"],
            "topic": TOPIC_INVENTORY_INSUFFICIENT,
        }


async def get_current_stock(
    tool_context: Optional[ToolContext] = None,
    tool_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Get the current stock levels for all sweet types.
    Useful for checking availability without reserving.

    Returns:
        A dictionary mapping sweet types to their current quantities.
    """
    stock = get_stock()
    log.info(f"[InventoryAgent] Stock query: {stock}")
    return {
        "status": "success",
        "stock": stock,
    }
