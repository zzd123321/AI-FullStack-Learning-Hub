import base64
import json
from dataclasses import dataclass, replace
from decimal import Decimal
from threading import Lock
from uuid import uuid4


class IdempotencyConflictError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Item:
    item_id: str
    name: str
    price: Decimal
    version: int
    sequence: int


@dataclass(frozen=True, slots=True)
class Page:
    items: list[Item]
    next_cursor: str | None


class ItemStore:
    def __init__(self) -> None:
        self._items: dict[str, Item] = {}
        self._idempotency: dict[str, tuple[str, Item]] = {}
        self._sequence = 0
        self._lock = Lock()

    @staticmethod
    def fingerprint(name: str, price: Decimal) -> str:
        return json.dumps(
            {"name": name, "price": str(price)},
            sort_keys=True,
            separators=(",", ":"),
        )

    def create(self, key: str, name: str, price: Decimal) -> tuple[Item, bool]:
        request_fingerprint = self.fingerprint(name, price)
        with self._lock:
            cached = self._idempotency.get(key)
            if cached is not None:
                if cached[0] != request_fingerprint:
                    raise IdempotencyConflictError(
                        "idempotency key belongs to a different request"
                    )
                return cached[1], True
            self._sequence += 1
            item = Item(str(uuid4()), name, price, 1, self._sequence)
            self._items[item.item_id] = item
            self._idempotency[key] = (request_fingerprint, item)
            return item, False

    def get(self, item_id: str) -> Item | None:
        return self._items.get(item_id)

    def update(
        self, item_id: str, expected_version: int, name: str | None, price: Decimal | None
    ) -> Item | None:
        with self._lock:
            current = self._items.get(item_id)
            if current is None:
                return None
            if current.version != expected_version:
                raise ValueError("etag does not match current representation")
            updated = replace(
                current,
                name=name if name is not None else current.name,
                price=price if price is not None else current.price,
                version=current.version + 1,
            )
            self._items[item_id] = updated
            return updated

    def delete(self, item_id: str) -> None:
        with self._lock:
            self._items.pop(item_id, None)

    @staticmethod
    def encode_cursor(item: Item) -> str:
        raw = json.dumps({"after": item.sequence}, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    @staticmethod
    def decode_cursor(cursor: str | None) -> int:
        if cursor is None:
            return 0
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            value = json.loads(base64.urlsafe_b64decode(padded))
            after = value["after"]
            if not isinstance(after, int) or after < 0:
                raise ValueError
            return after
        except Exception as error:
            raise ValueError("invalid cursor") from error

    def page(self, limit: int, cursor: str | None) -> Page:
        after = self.decode_cursor(cursor)
        ordered = sorted(
            (item for item in self._items.values() if item.sequence > after),
            key=lambda item: item.sequence,
        )
        selected = ordered[:limit]
        has_more = len(ordered) > limit
        next_cursor = self.encode_cursor(selected[-1]) if selected and has_more else None
        return Page(selected, next_cursor)
