"""Task HTTP endpoints."""

from typing import Annotated

from fastapi import APIRouter, Path, Response, status

from ..dependencies import RequestContextDep, TaskQueryDep
from ..models import ErrorResponse, TaskCreate, TaskPage, TaskResponse
from ..service import TaskServiceDep

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    responses={422: {"model": ErrorResponse}},
)
async def create_task(
    payload: TaskCreate,
    response: Response,
    service: TaskServiceDep,
    context: RequestContextDep,
) -> TaskResponse:
    task = await service.create(payload)
    response.headers["Location"] = f"/api/v1/tasks/{task.id}"
    response.headers["X-Request-ID"] = context.request_id
    return TaskResponse.model_validate(task)


@router.get(
    "",
    response_model=TaskPage,
    responses={422: {"model": ErrorResponse}},
)
async def list_tasks(query: TaskQueryDep, service: TaskServiceDep) -> TaskPage:
    records, total = await service.list(query)
    return TaskPage(
        items=[TaskResponse.model_validate(record) for record in records],
        total=total,
        offset=query.offset,
        limit=query.limit,
    )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
async def get_task(
    task_id: Annotated[int, Path(ge=1)],
    service: TaskServiceDep,
) -> TaskResponse:
    return TaskResponse.model_validate(await service.get(task_id))
