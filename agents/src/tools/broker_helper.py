"""
Shared helper to publish UNS events from SAM agent tools.
Uses the solace-pubsubplus Python client to publish to the broker.
"""
import json
import uuid
import os
from datetime import datetime, timezone
from typing import Any

from solace.messaging.messaging_service import MessagingService
from solace.messaging.resources.topic import Topic
from solace.messaging.config.transport_security_strategy import TLS

_publisher = None
_messaging_service = None


def _get_publisher():
    """Lazy-initialize a direct publisher to the broker."""
    global _publisher, _messaging_service

    if _publisher is not None:
        return _publisher

    broker_url = os.environ.get("SOLACE_BROKER_URL", "ws://localhost:8008")
    vpn = os.environ.get("SOLACE_BROKER_VPN", "default")
    username = os.environ.get("SOLACE_BROKER_USERNAME", "haribot")
    password = os.environ.get("SOLACE_BROKER_PASSWORD", "haribot")

    broker_props = {
        "solace.messaging.transport.host": broker_url,
        "solace.messaging.service.vpn-name": vpn,
        "solace.messaging.authentication.scheme.basic.username": username,
        "solace.messaging.authentication.scheme.basic.password": password,
    }

    _messaging_service = MessagingService.builder() \
        .from_properties(broker_props) \
        .build()
    _messaging_service.connect()

    _publisher = _messaging_service.create_direct_message_publisher_builder().build()
    _publisher.start()

    return _publisher


def create_event(source: str, correlation_id: str, payload: dict) -> dict:
    """Create a UNS event envelope."""
    return {
        "eventId": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "correlationId": correlation_id,
        "payload": payload,
    }


def publish_event(topic_str: str, source: str, correlation_id: str, payload: dict) -> dict:
    """
    Publish a UNS event to the specified topic.
    Returns the event envelope that was published.
    """
    publisher = _get_publisher()
    event = create_event(source, correlation_id, payload)

    message_body = json.dumps(event)
    topic = Topic.of(topic_str)

    outbound_msg = _messaging_service.message_builder().build(message_body)
    publisher.publish(outbound_msg, topic)

    return event


# Topic constants (mirrors packages/common/src/topics.mjs)
SITE = "paris-demo"
AREA = "packing"
LINE = "line1"


def uns_topic(message_type: str) -> str:
    """Build a fully-qualified UNS topic."""
    return f"haribot/{SITE}/{AREA}/{LINE}/{message_type}"


# Pre-built topics
TOPIC_ORDER_VALIDATED = uns_topic("orders/validated")
TOPIC_ORDER_REJECTED = uns_topic("orders/rejected")
TOPIC_INVENTORY_RESERVED = uns_topic("inventory/reserved")
TOPIC_INVENTORY_INSUFFICIENT = uns_topic("inventory/insufficient")
TOPIC_PACK_JOB_SEQUENCED = uns_topic("pack-job/sequenced")
TOPIC_PACK_JOB_STATUS = uns_topic("pack-job/status")
TOPIC_ARM_COMMAND = uns_topic("arm/command")
TOPIC_HITL_APPROVAL_REQUIRED = uns_topic("hitl/approval-required")
