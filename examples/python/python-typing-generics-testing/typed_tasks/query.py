"""Generic collection operations that preserve element types."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

from .models import Page


T = TypeVar("T")


def paginate(items: Sequence[T], *, offset: int, limit: int) -> Page[T]:
    if offset < 0:
        raise ValueError("offset must not be negative")
    if limit <= 0:
        raise ValueError("limit must be positive")

    return Page(
        items=tuple(items[offset : offset + limit]),
        total=len(items),
        offset=offset,
        limit=limit,
    )
