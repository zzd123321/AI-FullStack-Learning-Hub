"""Structural interfaces required by the application service."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from .models import Task, TaskId


class TaskRepository(Protocol):
    def get(self, task_id: TaskId) -> Task: ...

    def save(self, task: Task) -> None: ...


class TaskNotifier(Protocol):
    def task_completed(self, task: Task) -> None: ...


class Clock(Protocol):
    def now(self) -> datetime: ...
