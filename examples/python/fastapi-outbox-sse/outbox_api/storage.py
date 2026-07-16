import json
import sqlite3
from pathlib import Path
from threading import Lock


class IdempotencyConflictError(ValueError):
    """同一个幂等键被用于不同请求。"""


class EventStore:
    def __init__(self, path: Path) -> None:
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.lock = Lock()
        self.connection.executescript(
            """
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS jobs(
              id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS outbox(
              id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, payload TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              next_attempt_at REAL NOT NULL DEFAULT 0,
              published INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS idempotency(
              key TEXT PRIMARY KEY, request TEXT NOT NULL, response TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS processed_events(
              consumer TEXT NOT NULL, event_id INTEGER NOT NULL,
              PRIMARY KEY(consumer, event_id)
            );
            CREATE TABLE IF NOT EXISTS notifications(
              id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL UNIQUE, body TEXT NOT NULL
            );
            """
        )

    def __enter__(self) -> "EventStore":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def create_job(self, key: str, name: str, fail_before_commit: bool = False) -> tuple[dict, bool]:
        canonical_request = json.dumps(
            {"name": name}, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        with self.lock:
            try:
                self.connection.execute("BEGIN IMMEDIATE")
                cached = self.connection.execute(
                    "SELECT request,response FROM idempotency WHERE key=?", (key,)
                ).fetchone()
                if cached:
                    if cached["request"] != canonical_request:
                        raise IdempotencyConflictError(
                            "the idempotency key belongs to a different request"
                        )
                    self.connection.commit()
                    return json.loads(cached["response"]), True
                cursor = self.connection.execute(
                    "INSERT INTO jobs(name,status) VALUES(?,?)", (name, "accepted")
                )
                job_id = cursor.lastrowid
                payload = {"job_id": job_id, "name": name}
                self.connection.execute(
                    "INSERT INTO outbox(event_type,payload) VALUES(?,?)",
                    ("job.accepted", json.dumps(payload)),
                )
                response = {"id": job_id, "name": name, "status": "accepted"}
                self.connection.execute(
                    "INSERT INTO idempotency(key,request,response) VALUES(?,?,?)",
                    (key, canonical_request, json.dumps(response)),
                )
                if fail_before_commit:
                    raise RuntimeError("simulated transaction failure")
                self.connection.commit()
                return response, False
            except Exception:
                self.connection.rollback()
                raise

    def unpublished(self, now: float) -> sqlite3.Row | None:
        return self.connection.execute(
            """SELECT * FROM outbox
               WHERE published=0 AND next_attempt_at<=?
               ORDER BY id LIMIT 1""",
            (now,),
        ).fetchone()

    def mark_published(self, event_id: int) -> None:
        self.connection.execute("UPDATE outbox SET published=1 WHERE id=?", (event_id,))
        self.connection.commit()

    def record_failure(self, event_id: int, next_attempt_at: float) -> int:
        self.connection.execute(
            """UPDATE outbox
               SET attempts=attempts+1, next_attempt_at=? WHERE id=?""",
            (next_attempt_at, event_id),
        )
        self.connection.commit()
        return self.connection.execute(
            "SELECT attempts FROM outbox WHERE id=?", (event_id,)
        ).fetchone()[0]

    def events_after(self, event_id: int) -> list[sqlite3.Row]:
        return self.connection.execute(
            "SELECT * FROM outbox WHERE id>? ORDER BY id", (event_id,)
        ).fetchall()

    def consume_once(self, consumer: str, event_id: int, payload: str) -> bool:
        with self.lock:
            try:
                self.connection.execute("BEGIN IMMEDIATE")
                cursor = self.connection.execute(
                    "INSERT OR IGNORE INTO processed_events(consumer,event_id) VALUES(?,?)",
                    (consumer, event_id),
                )
                if cursor.rowcount == 0:
                    self.connection.commit()
                    return False
                self.connection.execute(
                    "INSERT INTO notifications(event_id,body) VALUES(?,?)",
                    (event_id, payload),
                )
                self.connection.commit()
                return True
            except Exception:
                self.connection.rollback()
                raise

    def count(self, table: str) -> int:
        if table not in {"jobs", "outbox", "notifications"}:
            raise ValueError("unsupported table")
        return self.connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def close(self) -> None:
        self.connection.close()
