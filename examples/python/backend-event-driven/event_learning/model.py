from __future__ import annotations

import copy
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4


@dataclass(frozen=True)
class Event:
    event_id: str
    event_type: str
    source: str
    subject: str
    occurred_at: str
    data: dict


@dataclass
class OutboxRecord:
    event: Event
    published: bool = False


@dataclass(frozen=True)
class Order:
    order_id: str
    customer_id: str
    total: str


class OrderDatabase:
    """Orders and outbox rows share one simulated database transaction."""

    def __init__(self) -> None:
        self._orders: dict[str, Order] = {}
        self._outbox: dict[str, OutboxRecord] = {}
        self._lock = Lock()

    def create_order(self, order_id: str, customer_id: str, total: str) -> Event:
        event = Event(
            event_id=str(uuid4()),
            event_type="com.example.order.created.v1",
            source="/services/orders",
            subject=f"orders/{order_id}",
            occurred_at=datetime.now(timezone.utc).isoformat(),
            data={"order_id": order_id, "customer_id": customer_id, "total": total},
        )
        with self._lock:
            if order_id in self._orders:
                raise ValueError("order already exists")
            self._orders[order_id] = Order(order_id, customer_id, total)
            self._outbox[event.event_id] = OutboxRecord(event)
        return copy.deepcopy(event)

    def pending_outbox(self) -> list[OutboxRecord]:
        with self._lock:
            return [copy.deepcopy(row) for row in self._outbox.values() if not row.published]

    def mark_published(self, event_id: str) -> None:
        with self._lock:
            self._outbox[event_id].published = True

    def has_order(self, order_id: str) -> bool:
        with self._lock:
            return order_id in self._orders


@dataclass
class QueuedMessage:
    event: Event
    attempts: int = 0


@dataclass
class Delivery:
    broker: InMemoryBroker
    topic: str
    group: str
    message: QueuedMessage
    settled: bool = field(default=False, init=False)

    @property
    def event(self) -> Event:
        return copy.deepcopy(self.message.event)

    def ack(self) -> None:
        if self.settled:
            raise RuntimeError("delivery already settled")
        self.settled = True

    def nack(self, *, requeue: bool) -> None:
        if self.settled:
            raise RuntimeError("delivery already settled")
        self.settled = True
        self.broker.reject(self.topic, self.group, self.message, requeue=requeue)


class InMemoryBroker:
    """One queue per (topic, consumer group), with explicit ack/nack."""

    def __init__(self, max_attempts: int = 3) -> None:
        self._queues: dict[tuple[str, str], deque[QueuedMessage]] = {}
        self._dead_letters: dict[tuple[str, str], list[QueuedMessage]] = defaultdict(list)
        self._max_attempts = max_attempts
        self._lock = Lock()

    def subscribe(self, topic: str, group: str) -> None:
        with self._lock:
            self._queues.setdefault((topic, group), deque())

    def publish(self, topic: str, event: Event) -> None:
        with self._lock:
            destinations = [key for key in self._queues if key[0] == topic]
            for destination in destinations:
                self._queues[destination].append(QueuedMessage(copy.deepcopy(event)))

    def receive(self, topic: str, group: str) -> Delivery | None:
        with self._lock:
            queue = self._queues[(topic, group)]
            if not queue:
                return None
            message = queue.popleft()
            message.attempts += 1
        return Delivery(self, topic, group, message)

    def reject(
        self,
        topic: str,
        group: str,
        message: QueuedMessage,
        *,
        requeue: bool,
    ) -> None:
        with self._lock:
            destination = (topic, group)
            if requeue and message.attempts < self._max_attempts:
                self._queues[destination].append(message)
            else:
                self._dead_letters[destination].append(message)

    def dead_letters(self, topic: str, group: str) -> list[QueuedMessage]:
        with self._lock:
            return copy.deepcopy(self._dead_letters[(topic, group)])


class OutboxRelay:
    def __init__(self, database: OrderDatabase, broker: InMemoryBroker) -> None:
        self._database = database
        self._broker = broker

    def publish_pending(self, *, crash_after_publish: bool = False) -> None:
        for row in self._database.pending_outbox():
            self._broker.publish("orders", row.event)
            if crash_after_publish:
                raise RuntimeError("relay crashed before marking the outbox row")
            self._database.mark_published(row.event.event_id)


class FulfillmentProjection:
    """The inbox marker and business side effect are committed under one lock."""

    def __init__(self) -> None:
        self._processed_event_ids: set[str] = set()
        self.shipments: list[str] = []
        self._lock = Lock()

    def apply_once(self, event: Event) -> bool:
        with self._lock:
            if event.event_id in self._processed_event_ids:
                return False
            if event.event_type != "com.example.order.created.v1":
                raise ValueError("unsupported event type")
            self.shipments.append(event.data["order_id"])
            self._processed_event_ids.add(event.event_id)
            return True


def consume_one(
    broker: InMemoryBroker,
    projection: FulfillmentProjection,
    *,
    fail_before_commit: bool = False,
) -> bool:
    delivery = broker.receive("orders", "fulfillment")
    if delivery is None:
        return False
    try:
        if fail_before_commit:
            raise RuntimeError("temporary database failure")
        projection.apply_once(delivery.event)
    except RuntimeError:
        delivery.nack(requeue=True)
        return False
    except ValueError:
        delivery.nack(requeue=False)
        return False
    delivery.ack()
    return True
