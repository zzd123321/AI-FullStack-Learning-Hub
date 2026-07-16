from dataclasses import dataclass, field
from time import time
from collections.abc import Callable

from .storage import EventStore


@dataclass(slots=True)
class FakeBroker:
    deliveries: list[tuple[int, str]] = field(default_factory=list)

    def publish(self, event_id: int, payload: str) -> None:
        self.deliveries.append((event_id, payload))


class OutboxRelay:
    def __init__(
        self,
        store: EventStore,
        broker: FakeBroker,
        clock: Callable[[], float] = time,
    ) -> None:
        self.store = store
        self.broker = broker
        self.clock = clock

    @staticmethod
    def retry_delay(attempt: int) -> float:
        """第 1 次失败等 1 秒，随后指数退避，最长 60 秒。"""
        return min(2 ** max(attempt - 1, 0), 60)

    def publish_one(self, crash_after_publish: bool = False) -> bool:
        now = self.clock()
        event = self.store.unpublished(now)
        if event is None:
            return False
        try:
            self.broker.publish(event["id"], event["payload"])
            if crash_after_publish:
                raise RuntimeError("relay crashed before acknowledgement")
            self.store.mark_published(event["id"])
            return True
        except Exception:
            next_attempt = event["attempts"] + 1
            self.store.record_failure(
                event["id"], now + self.retry_delay(next_attempt)
            )
            raise
