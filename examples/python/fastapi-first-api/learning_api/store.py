"""A process-local adapter used to keep the first API runnable."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TaskRecord:
    id: int
    title: str
    priority: int
    completed: bool = False


class TaskNotFoundError(LookupError):
    def __init__(self, task_id: int) -> None:
        self.task_id = task_id
        super().__init__(f"task does not exist: {task_id}")


class TaskStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._records: dict[int, TaskRecord] = {}
        self._next_id = 1

    async def create(self, *, title: str, priority: int) -> TaskRecord:
        async with self._lock:
            task = TaskRecord(id=self._next_id, title=title, priority=priority)
            self._records[task.id] = task
            self._next_id += 1
            return task

    async def get(self, task_id: int) -> TaskRecord:
        try:
            return self._records[task_id]
        except KeyError as error:
            raise TaskNotFoundError(task_id) from error

    async def close(self) -> None:
        self._records.clear()
