"""Domain types and a reusable generic page."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Generic, Literal, NewType, NotRequired, TypeVar, TypedDict


TaskId = NewType("TaskId", str)
TaskStatus = Literal["pending", "completed"]


class TaskPayload(TypedDict):
    """Shape for already-trusted Python dictionaries, not untrusted JSON."""

    id: str
    title: str
    priority: int
    status: TaskStatus
    tags: NotRequired[list[str]]


@dataclass(frozen=True, slots=True)
class Task:
    id: TaskId
    title: str
    priority: int
    status: TaskStatus
    tags: tuple[str, ...] = ()


T = TypeVar("T")
U = TypeVar("U")


@dataclass(frozen=True, slots=True)
class Page(Generic[T]):
    items: tuple[T, ...]
    total: int
    offset: int
    limit: int

    def __post_init__(self) -> None:
        if self.total < 0:
            raise ValueError("total must not be negative")
        if self.offset < 0:
            raise ValueError("offset must not be negative")
        if self.limit <= 0:
            raise ValueError("limit must be positive")
        if len(self.items) > self.limit:
            raise ValueError("items must not exceed the page limit")

    def map(self, transform: Callable[[T], U]) -> Page[U]:
        return Page(
            items=tuple(transform(item) for item in self.items),
            total=self.total,
            offset=self.offset,
            limit=self.limit,
        )
