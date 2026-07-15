"""A lazy event pipeline built with the iterable and iterator protocols."""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Mapping
from itertools import islice
from typing import TypeAlias

Event: TypeAlias = dict[str, str]


def iter_valid_events(rows: Iterable[Mapping[str, object]]) -> Iterator[Event]:
    """Validate rows lazily and yield normalized events one at a time."""
    for position, row in enumerate(rows, start=1):
        user_id = row.get("user_id")
        event_type = row.get("event_type")
        if not isinstance(user_id, str) or not user_id.strip():
            raise ValueError(f"row {position}: user_id must be a non-blank string")
        if not isinstance(event_type, str) or not event_type.strip():
            raise ValueError(f"row {position}: event_type must be a non-blank string")
        yield {
            "user_id": user_id.strip(),
            "event_type": event_type.strip().lower(),
        }


def batched(items: Iterable[Event], size: int) -> Iterator[tuple[Event, ...]]:
    """Consume any iterable in bounded tuples without materializing it all."""
    if isinstance(size, bool) or not isinstance(size, int):
        raise TypeError("size must be an int")
    if size < 1:
        raise ValueError("size must be greater than zero")

    iterator = iter(items)
    while batch := tuple(islice(iterator, size)):
        yield batch


def summarize_events(events: Iterable[Event]) -> dict[str, object]:
    """Consume events once and aggregate ordered counts and unique users."""
    counts: dict[str, int] = {}
    users: set[str] = set()
    total = 0

    for event in events:
        event_type = event["event_type"]
        counts[event_type] = counts.get(event_type, 0) + 1
        users.add(event["user_id"])
        total += 1

    return {
        "total": total,
        "counts": counts,
        "unique_users": sorted(users),
    }
