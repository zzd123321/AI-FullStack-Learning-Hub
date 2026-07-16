import json
import sqlite3
from contextlib import closing
from decimal import Decimal
from pathlib import Path

from .domain import Order, OrderPlaced


class SqliteDatabase:
    def __init__(self, path: Path, fail_on_outbox: bool = False) -> None:
        self.path = path
        self.fail_on_outbox = fail_on_outbox

    def initialize(self) -> None:
        with closing(sqlite3.connect(self.path)) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS orders(
                  order_id TEXT PRIMARY KEY, product_id TEXT NOT NULL,
                  product_name TEXT NOT NULL, unit_price TEXT NOT NULL,
                  quantity INTEGER NOT NULL, status TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outbox(
                  id INTEGER PRIMARY KEY, event_type TEXT NOT NULL,
                  aggregate_id TEXT NOT NULL, payload TEXT NOT NULL
                );
                """
            )
            connection.commit()

    def unit_of_work(self) -> "SqliteUnitOfWork":
        return SqliteUnitOfWork(self)

    def count(self, table: str) -> int:
        if table not in {"orders", "outbox"}:
            raise ValueError("unsupported table")
        with closing(sqlite3.connect(self.path)) as connection:
            return connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]


class SqliteOrderRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def get(self, order_id: str) -> Order | None:
        row = self.connection.execute(
            "SELECT * FROM orders WHERE order_id=?", (order_id,)
        ).fetchone()
        if row is None:
            return None
        return Order(row[0], row[1], row[2], Decimal(row[3]), row[4], row[5])

    def add(self, order: Order) -> None:
        self.connection.execute(
            "INSERT INTO orders VALUES(?,?,?,?,?,?)",
            (
                order.order_id,
                order.product_id,
                order.product_name,
                str(order.unit_price),
                order.quantity,
                order.status,
            ),
        )


class SqliteEventOutbox:
    def __init__(self, connection: sqlite3.Connection, fail: bool) -> None:
        self.connection = connection
        self.fail = fail

    def add(self, event: OrderPlaced) -> None:
        if self.fail:
            raise RuntimeError("simulated outbox failure")
        payload = {
            "order_id": event.order_id,
            "product_id": event.product_id,
            "total": str(event.total),
        }
        self.connection.execute(
            "INSERT INTO outbox(event_type,aggregate_id,payload) VALUES(?,?,?)",
            ("order.placed", event.order_id, json.dumps(payload)),
        )


class SqliteUnitOfWork:
    def __init__(self, database: SqliteDatabase) -> None:
        self.database = database

    def __enter__(self) -> "SqliteUnitOfWork":
        self.connection = sqlite3.connect(self.database.path)
        try:
            self.connection.execute("BEGIN")
            self.orders = SqliteOrderRepository(self.connection)
            self.outbox = SqliteEventOutbox(
                self.connection, self.database.fail_on_outbox
            )
            self.committed = False
            return self
        except Exception:
            self.connection.close()
            raise

    def commit(self) -> None:
        self.connection.commit()
        self.committed = True

    def __exit__(self, *args: object) -> None:
        try:
            if not self.committed:
                self.connection.rollback()
        finally:
            self.connection.close()
