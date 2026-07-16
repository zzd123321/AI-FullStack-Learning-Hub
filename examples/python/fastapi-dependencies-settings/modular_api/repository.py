"""Repository boundary and a process-local learning implementation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from .models import TaskCreate, TaskQuery, TaskStatus


@dataclass(slots=True)
class TaskRecord:
    id: int
    title: str
    description: str | None
    priority: int
    tags: list[str] = field(default_factory=list)
    status: TaskStatus = "pending"
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class TaskRepository(Protocol):
    async def create(self, payload: TaskCreate) -> TaskRecord: ...

    async def get(self, task_id: int) -> TaskRecord | None: ...

    async def list(self, query: TaskQuery) -> tuple[list[TaskRecord], int]: ...


class InMemoryTaskRepository:
    """A single-process repository; it is not a production database."""

    def __init__(self) -> None:
        self._records: dict[int, TaskRecord] = {}
        self._next_id = 1
        self._lock = asyncio.Lock()
        self.closed = False

    async def create(self, payload: TaskCreate) -> TaskRecord:
        async with self._lock:
            record = TaskRecord(id=self._next_id, **payload.model_dump())
            self._records[record.id] = record
            self._next_id += 1
            return record

    async def get(self, task_id: int) -> TaskRecord | None:
        return self._records.get(task_id)

    async def list(self, query: TaskQuery) -> tuple[list[TaskRecord], int]:
        records = list(self._records.values())
        if query.q is not None:
            needle = query.q.casefold()
            records = [record for record in records if needle in record.title.casefold()]
        if query.status is not None:
            records = [record for record in records if record.status == query.status]
        if query.min_priority is not None:
            records = [record for record in records if record.priority >= query.min_priority]
        total = len(records)
        return records[query.offset : query.offset + query.limit], total

    async def close(self) -> None:
        self.closed = True
