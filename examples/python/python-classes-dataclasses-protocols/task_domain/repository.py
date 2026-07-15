"""One concrete repository adapter backed by process memory."""

from __future__ import annotations

from .models import Task, TaskId


class TaskNotFoundError(LookupError):
    """No task exists for the requested identity."""


class InMemoryTaskRepository:
    def __init__(self) -> None:
        self._tasks: dict[TaskId, Task] = {}

    def get(self, task_id: TaskId) -> Task:
        try:
            return self._tasks[task_id]
        except KeyError as error:
            raise TaskNotFoundError(f"task does not exist: {task_id}") from error

    def save(self, task: Task) -> None:
        self._tasks[task.id] = task
