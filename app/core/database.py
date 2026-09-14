"""SQLite Database Storage for AnyDesk Pro: Permanent Device Address & Connection History"""
import os
import time
import sqlite3
import tempfile
from pathlib import Path
from typing import List, Dict, Optional, Any


def get_db_path() -> Path:
    """Returns standard persistent SQLite path in user's AppData (VvcRemote)."""
    base_dir = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "VvcRemote"
    base_dir.mkdir(parents=True, exist_ok=True)
    db_file = base_dir / "vvc_remote.db"

    # Migration from previous AnyDeskPro database if exists
    if not db_file.exists():
        old_db = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "AnyDeskPro" / "anydesk_pro.db"
        if old_db.exists():
            try:
                import shutil
                shutil.copy2(str(old_db), str(db_file))
            except Exception:
                pass

    return db_file


class DatabaseManager:
    """
    Manages persistent SQLite storage for:
    1. Permanent 9-digit Device Peer ID (never changes across app restarts)
    2. Connection History (Remote Desks, timestamps, connection duration, nicknames)
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or get_db_path()
        self._init_tables()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS connection_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                remote_id TEXT NOT NULL,
                alias TEXT,
                remote_ip TEXT,
                direction TEXT DEFAULT 'outgoing',
                status TEXT DEFAULT 'connected',
                connected_at REAL NOT NULL,
                duration_seconds INTEGER DEFAULT 0
            )
            """)
            cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_conn_remote_id ON connection_history(remote_id);
            """)
            cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_conn_connected_at ON connection_history(connected_at DESC);
            """)
            conn.commit()
        self.deduplicate_history()

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Retrieves a persistent setting value by key."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        """Persists a setting value by key."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
            conn.commit()

    def get_or_create_device_peer_id(self, default_generator_func) -> str:
        """
        Retrieves the permanent device peer ID or generates and persists a new one.
        Ensures the 9-digit address is remembered permanently on this machine.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'device_peer_id'")
            row = cursor.fetchone()
            if row and row["value"]:
                return row["value"]

            new_id = default_generator_func()
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('device_peer_id', ?)", (new_id,))
            conn.commit()
            return new_id

    def deduplicate_history(self):
        """Keeps only the most recent entry for each remote_id."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    DELETE FROM connection_history
                    WHERE id NOT IN (
                        SELECT MAX(id)
                        FROM connection_history
                        GROUP BY remote_id
                    )
                """)
                conn.commit()
        except Exception:
            pass

    def record_connection(
        self,
        remote_id: str,
        alias: Optional[str] = None,
        remote_ip: Optional[str] = None,
        direction: str = "outgoing",
        status: str = "connected",
        duration_seconds: int = 0
    ) -> int:
        """Records or updates a connection session in history without creating duplicates."""
        clean_id = remote_id.strip()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Check if this remote_id already exists in history
            cursor.execute(
                "SELECT id, alias FROM connection_history WHERE remote_id = ? ORDER BY id DESC LIMIT 1",
                (clean_id,)
            )
            existing = cursor.fetchone()
            if existing:
                row_id = existing["id"]
                final_alias = alias if alias else existing["alias"]
                cursor.execute("""
                    UPDATE connection_history 
                    SET connected_at = ?, remote_ip = ?, alias = ?, direction = ?, status = ?, duration_seconds = ?
                    WHERE id = ?
                """, (time.time(), remote_ip or "", final_alias, direction, status, duration_seconds, row_id))
                # Delete any other duplicate rows for this remote_id
                cursor.execute("DELETE FROM connection_history WHERE remote_id = ? AND id != ?", (clean_id, row_id))
                conn.commit()
                return row_id

            cursor.execute("""
                INSERT INTO connection_history (remote_id, alias, remote_ip, direction, status, connected_at, duration_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (clean_id, alias, remote_ip or "", direction, status, time.time(), duration_seconds))
            conn.commit()
            return cursor.lastrowid

    def update_connection_duration(self, history_id: int, duration_seconds: int):
        """Updates session duration when session ends."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE connection_history SET duration_seconds = ? WHERE id = ?",
                (duration_seconds, history_id)
            )
            conn.commit()

    def get_recent_connections(self, limit: int = 25) -> List[Dict[str, Any]]:
        """Returns unique recent connection history per device ordered by most recent."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    MAX(id) as id,
                    remote_id,
                    MAX(alias) as alias,
                    MAX(remote_ip) as remote_ip,
                    MAX(direction) as direction,
                    MAX(status) as status,
                    MAX(connected_at) as connected_at,
                    MAX(duration_seconds) as duration_seconds
                FROM connection_history
                GROUP BY remote_id
                ORDER BY MAX(connected_at) DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def set_alias(self, remote_id: str, alias: str):
        """Sets a friendly nickname for a remote computer address."""
        clean_id = remote_id.strip()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE connection_history SET alias = ? WHERE remote_id = ?",
                (alias.strip(), clean_id)
            )
            conn.commit()

    def delete_history_item(self, history_id: int):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM connection_history WHERE id = ?", (history_id,))
            conn.commit()

    def clear_history(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM connection_history")
            conn.commit()


# Shared singleton database instance
DB = DatabaseManager()
