"""
Simple SQLite inventory model for the demo.
Tracks stock levels per sweet type.
"""
import sqlite3
import os
import threading

DB_PATH = os.path.join(os.path.dirname(__file__), "inventory.db")

# Default stock levels (20 of each for demo)
DEFAULT_STOCK = {
    "goldbears": 20,
    "happy-cola": 20,
    "starmix": 20,
    "tangfastics": 20,
    "strawbs": 20,
    "rings": 20,
}

_lock = threading.Lock()


def _get_conn():
    """Get a thread-local connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize the inventory database with default stock levels."""
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            sweet_type TEXT PRIMARY KEY,
            quantity INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            correlation_id TEXT NOT NULL,
            sweet_type TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Seed stock if table is empty
    cursor = conn.execute("SELECT COUNT(*) as cnt FROM inventory")
    if cursor.fetchone()["cnt"] == 0:
        for sweet_type, qty in DEFAULT_STOCK.items():
            conn.execute(
                "INSERT INTO inventory (sweet_type, quantity) VALUES (?, ?)",
                (sweet_type, qty),
            )
    conn.commit()
    conn.close()


def get_stock() -> dict:
    """Get current stock levels for all sweet types."""
    conn = _get_conn()
    cursor = conn.execute("SELECT sweet_type, quantity FROM inventory")
    stock = {row["sweet_type"]: row["quantity"] for row in cursor.fetchall()}
    conn.close()
    return stock


def reserve_stock(correlation_id: str, items: list) -> tuple:
    """
    Attempt to reserve stock for the given items.
    Returns (success: bool, result: dict)
    - On success: result = {"remainingStock": {...}}
    - On failure: result = {"reason": "...", "availableStock": {...}}

    Uses a lock for thread safety and checks+decrements atomically.
    """
    with _lock:
        conn = _get_conn()
        try:
            # Check availability first
            insufficient = []
            for item in items:
                sweet_type = item["sweetType"]
                quantity = item["quantity"]
                cursor = conn.execute(
                    "SELECT quantity FROM inventory WHERE sweet_type = ?",
                    (sweet_type,),
                )
                row = cursor.fetchone()
                available = row["quantity"] if row else 0
                if available < quantity:
                    insufficient.append(
                        f"{sweet_type}: need {quantity}, have {available}"
                    )

            if insufficient:
                stock = get_stock()
                conn.close()
                return False, {
                    "reason": "Insufficient stock: " + "; ".join(insufficient),
                    "availableStock": stock,
                }

            # Decrement stock and record reservation
            for item in items:
                sweet_type = item["sweetType"]
                quantity = item["quantity"]
                conn.execute(
                    "UPDATE inventory SET quantity = quantity - ? WHERE sweet_type = ?",
                    (quantity, sweet_type),
                )
                conn.execute(
                    "INSERT INTO reservations (correlation_id, sweet_type, quantity) VALUES (?, ?, ?)",
                    (correlation_id, sweet_type, quantity),
                )

            conn.commit()
            remaining = {}
            cursor = conn.execute("SELECT sweet_type, quantity FROM inventory")
            for row in cursor.fetchall():
                remaining[row["sweet_type"]] = row["quantity"]

            conn.close()
            return True, {"remainingStock": remaining}

        except Exception as e:
            conn.rollback()
            conn.close()
            raise e


def reset_stock():
    """Reset all stock to default levels (for demo reset)."""
    conn = _get_conn()
    for sweet_type, qty in DEFAULT_STOCK.items():
        conn.execute(
            "INSERT OR REPLACE INTO inventory (sweet_type, quantity) VALUES (?, ?)",
            (sweet_type, qty),
        )
    conn.execute("DELETE FROM reservations")
    conn.commit()
    conn.close()


# Initialize on import
init_db()
