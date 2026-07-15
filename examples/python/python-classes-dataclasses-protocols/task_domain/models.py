"""Domain objects with explicit invariants and state transitions."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from enum import Enum


class InvalidTaskError(ValueError):
    """A task could not satisfy the domain invariants."""


@dataclass(frozen=True, slots=True, order=True)
class TaskId:
    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip()
        if not normalized:
            raise InvalidTaskError("task id must not be blank")
        object.__setattr__(self, "value", normalized)

    @classmethod
    def parse(cls, raw: str) -> TaskId:
        return cls(raw)

    def __str__(self) -> str:
        return self.value


class TaskStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"


@dataclass(frozen=True, slots=True)
class Task:
    id: TaskId
    title: str
    priority: int = 1
    tags: tuple[str, ...] = ()
    status: TaskStatus = TaskStatus.PENDING
    completed_at: datetime | None = None

    def __post_init__(self) -> None:
        normalized_title = self.title.strip()
        normalized_tags = tuple(tag.strip() for tag in self.tags if tag.strip())

        if not normalized_title:
            raise InvalidTaskError("task title must not be blank")
        if not 1 <= self.priority <= 5:
            raise InvalidTaskError("task priority must be between 1 and 5")
        if self.status is TaskStatus.PENDING and self.completed_at is not None:
            raise InvalidTaskError("a pending task cannot have completed_at")
        if self.status is TaskStatus.COMPLETED and self.completed_at is None:
            raise InvalidTaskError("a completed task requires completed_at")

        object.__setattr__(self, "title", normalized_title)
        object.__setattr__(self, "tags", normalized_tags)

    @property
    def is_completed(self) -> bool:
        return self.status is TaskStatus.COMPLETED

    def complete(self, *, at: datetime) -> Task:
        if self.is_completed:
            return self
        return replace(self, status=TaskStatus.COMPLETED, completed_at=at)
