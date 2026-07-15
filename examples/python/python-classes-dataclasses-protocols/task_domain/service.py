"""Application orchestration depending on protocols rather than implementations."""

from __future__ import annotations

from .models import Task, TaskId
from .ports import Clock, TaskNotifier, TaskRepository


class TaskService:
    def __init__(
        self,
        repository: TaskRepository,
        notifier: TaskNotifier,
        clock: Clock,
    ) -> None:
        self._repository = repository
        self._notifier = notifier
        self._clock = clock

    def complete(self, task_id: TaskId) -> Task:
        current = self._repository.get(task_id)
        completed = current.complete(at=self._clock.now())

        if completed is not current:
            self._repository.save(completed)
            self._notifier.task_completed(completed)

        return completed
