"""Use-case service assembled from request-scoped dependencies."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends

from .dependencies import RepositoryDep, RequestContextDep
from .errors import TaskNotFoundError
from .models import TaskCreate, TaskQuery
from .repository import TaskRecord, TaskRepository


@dataclass(slots=True)
class TaskService:
    repository: TaskRepository
    request_id: str

    async def create(self, payload: TaskCreate) -> TaskRecord:
        return await self.repository.create(payload)

    async def get(self, task_id: int) -> TaskRecord:
        task = await self.repository.get(task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        return task

    async def list(self, query: TaskQuery) -> tuple[list[TaskRecord], int]:
        return await self.repository.list(query)


def get_task_service(
    repository: RepositoryDep,
    context: RequestContextDep,
) -> TaskService:
    return TaskService(repository=repository, request_id=context.request_id)


TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
