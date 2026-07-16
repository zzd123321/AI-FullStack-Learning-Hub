"""Task HTTP endpoints."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from .dependencies import TaskServiceDep
from .models import ErrorResponse, TaskBatchCreate, TaskCreate, TaskPage, TaskResponse
from .orm import TaskStatus

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}},
)
def create_task(
    payload: TaskCreate,
    response: Response,
    service: TaskServiceDep,
) -> TaskResponse:
    row = service.create(payload)
    response.headers["Location"] = f"/api/v1/tasks/{row.id}"
    return TaskResponse.model_validate(row)


@router.post(
    "/batch",
    response_model=list[TaskResponse],
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}},
)
def create_task_batch(
    payload: TaskBatchCreate,
    service: TaskServiceDep,
) -> list[TaskResponse]:
    return [TaskResponse.model_validate(row) for row in service.create_batch(payload.tasks)]


@router.get("", response_model=TaskPage)
def list_tasks(
    service: TaskServiceDep,
    task_status: Annotated[TaskStatus | None, Query(alias="status")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TaskPage:
    rows, total = service.list(status=task_status, offset=offset, limit=limit)
    return TaskPage(
        items=[TaskResponse.model_validate(row) for row in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_task(
    task_id: Annotated[int, Path(ge=1)],
    service: TaskServiceDep,
) -> TaskResponse:
    return TaskResponse.model_validate(service.get(task_id))
