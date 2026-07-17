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
        # Service 只依赖 Protocol 描述的能力，不创建具体数据库或通知实现。
        self._repository = repository
        self._notifier = notifier
        self._clock = clock

    def complete(self, task_id: TaskId) -> Task:
        # 一次业务动作按“读取 → 领域计算 → 保存 → 通知”的顺序编排。
        current = self._repository.get(task_id)
        completed = current.complete(at=self._clock.now())

        if completed is not current:
            # complete 已经完成时会返回原对象，从而避免重复保存和通知。
            self._repository.save(completed)
            self._notifier.task_completed(completed)

        return completed
