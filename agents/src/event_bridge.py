"""
Event Bridge: UNS -> SAM Agent Mesh

Subscribes to UNS topics and forwards relevant events to SAM agents
by sending messages through the broker using SAM's internal routing.

This bridges the "raw UNS events" world with the "SAM agent conversation" world.
Each UNS event type is routed to the appropriate agent.

Usage:
    cd agents/
    source .venv/bin/activate
    python -m src.event_bridge
"""
import json
import os
import sys
import signal
import time
import logging
import threading
import requests

from dotenv import load_dotenv
from solace.messaging.messaging_service import MessagingService
from solace.messaging.resources.topic_subscription import TopicSubscription
from solace.messaging.receiver.message_receiver import InboundMessage

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.tools.arm_tools import mark_approved

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [EventBridge] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# SAM WebUI API endpoint for sending messages to agents
SAM_API_BASE = f"http://localhost:{os.environ.get('FASTAPI_PORT', '8000')}"

# Topic -> Agent routing map
TOPIC_ROUTING = {
    "haribot/paris-demo/packing/line1/orders/created": "OrderAgent",
    "haribot/paris-demo/packing/line1/orders/validated": "InventoryAgent",
    "haribot/paris-demo/packing/line1/inventory/reserved": "PackingAgent",
    "haribot/paris-demo/packing/line1/pack-job/sequenced": "ArmControlAgent",
    "haribot/paris-demo/packing/line1/hitl/approved": "_internal_hitl",
}


def send_to_agent(agent_name: str, message: str):
    """Send a message to a SAM agent via the WebUI API."""
    try:
        url = f"{SAM_API_BASE}/api/v1/message:stream"
        payload = {
            "jsonrpc": "2.0",
            "id": f"bridge-{int(time.time() * 1000)}",
            "method": "message/stream",
            "params": {
                "message": {
                    "role": "user",
                    "messageId": f"bridge-msg-{int(time.time() * 1000)}",
                    "kind": "message",
                    "parts": [{"kind": "text", "text": message}],
                    "metadata": {"agent_name": agent_name},
                }
            },
        }
        # Fire and forget (SSE stream response)
        resp = requests.post(url, json=payload, stream=True, timeout=30)
        # Read a bit to confirm it started
        for line in resp.iter_lines():
            if line:
                log.debug(f"Agent {agent_name} response: {line.decode()[:100]}")
                break
        resp.close()
        log.info(f"Message sent to {agent_name}")
    except requests.exceptions.ConnectionError:
        log.warning(f"Cannot reach SAM API at {SAM_API_BASE} - is SAM running?")
    except Exception as e:
        log.error(f"Error sending to {agent_name}: {e}")


def handle_message(topic: str, payload: dict):
    """Route a UNS event to the appropriate SAM agent."""
    agent_name = TOPIC_ROUTING.get(topic)
    if not agent_name:
        return

    correlation_id = payload.get("correlationId", "unknown")
    event_payload = payload.get("payload", {})

    # Special handling for HITL approval (no agent call needed)
    if agent_name == "_internal_hitl":
        mark_approved(correlation_id)
        log.info(f"HITL approval registered for correlationId={correlation_id[:8]}")
        return

    # Format the message for the agent
    if agent_name == "OrderAgent":
        message = (
            f"Validate this order:\n"
            f"- customer_name: {event_payload.get('customerName', '')}\n"
            f"- items: {json.dumps(event_payload.get('items', []))}\n"
            f"- correlation_id: {correlation_id}"
        )
    elif agent_name == "InventoryAgent":
        message = (
            f"Reserve inventory for this validated order:\n"
            f"- items: {json.dumps(event_payload.get('items', []))}\n"
            f"- correlation_id: {correlation_id}\n"
            f"- customer_name: {event_payload.get('customerName', '')}"
        )
    elif agent_name == "PackingAgent":
        message = (
            f"Sequence a pack job for this reserved order:\n"
            f"- items: {json.dumps(event_payload.get('items', []))}\n"
            f"- correlation_id: {correlation_id}\n"
            f"- customer_name: {event_payload.get('customerName', '')}"
        )
    elif agent_name == "ArmControlAgent":
        sequence = event_payload.get("sequence", [])
        message = (
            f"Plan and request approval for this pack sequence:\n"
            f"- sequence: {json.dumps(sequence)}\n"
            f"- correlation_id: {correlation_id}\n"
            f"- customer_name: {event_payload.get('customerName', '')}"
        )
    else:
        return

    # Send asynchronously to not block the message handler
    thread = threading.Thread(target=send_to_agent, args=(agent_name, message))
    thread.daemon = True
    thread.start()


def main():
    """Main event bridge loop."""
    log.info("Starting UNS -> SAM Event Bridge")

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

    messaging_service = MessagingService.builder() \
        .from_properties(broker_props) \
        .build()

    log.info(f"Connecting to {broker_url}...")
    messaging_service.connect()
    log.info("Connected to broker")

    # Subscribe to all relevant topics
    topics = [TopicSubscription.of(t) for t in TOPIC_ROUTING.keys()]

    receiver = messaging_service.create_direct_message_receiver_builder() \
        .with_subscriptions(topics) \
        .build()
    receiver.start()

    log.info(f"Subscribed to {len(topics)} topics:")
    for t in TOPIC_ROUTING:
        log.info(f"  {t} -> {TOPIC_ROUTING[t]}")

    # Handle graceful shutdown
    running = True

    def shutdown(signum, frame):
        nonlocal running
        log.info("Shutting down...")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    log.info("Event bridge running. Press Ctrl+C to stop.")

    while running:
        try:
            message: InboundMessage = receiver.receive_message(timeout=1000)
            if message is None:
                continue

            topic = message.get_destination_name()
            body = message.get_payload_as_string()

            if body:
                try:
                    payload = json.loads(body)
                    log.info(f"Event on {topic} (correlationId={payload.get('correlationId', '?')[:8]})")
                    handle_message(topic, payload)
                except json.JSONDecodeError:
                    log.warning(f"Non-JSON message on {topic}")
        except Exception as e:
            if running:
                log.error(f"Error receiving message: {e}")
                time.sleep(1)

    receiver.terminate()
    messaging_service.disconnect()
    log.info("Event bridge stopped")


if __name__ == "__main__":
    main()
