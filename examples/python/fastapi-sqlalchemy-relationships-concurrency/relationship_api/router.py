from typing import Annotated

from fastapi import APIRouter, Path, Response, status

from .dependencies import ExpectedVersionDep, ServiceDep
from .models import ProjectCreate, ProjectDetail, ProjectResponse, TaskCreate, TaskPatch, TaskResponse

router = APIRouter(prefix="/api/v1", tags=["projects"])


def set_etag(response: Response, version: int) -> None:
    response.headers["ETag"] = f'"{version}"'


@router.post("/projects", response_model=ProjectResponse, status_code=201)
def create_project(payload: ProjectCreate, service: ServiceDep) -> ProjectResponse:
    return ProjectResponse.model_validate(service.create_project(payload))


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=201)
def create_task(
    project_id: Annotated[int, Path(ge=1)],
    payload: TaskCreate,
    response: Response,
    service: ServiceDep,
) -> TaskResponse:
    row = service.create_task(project_id, payload)
    set_etag(response, row.version)
    return TaskResponse.model_validate(row)


@router.get("/projects", response_model=list[ProjectDetail])
def list_projects(service: ServiceDep) -> list[ProjectDetail]:
    return [ProjectDetail.model_validate(row) for row in service.list_projects()]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: Annotated[int, Path(ge=1)], response: Response, service: ServiceDep
) -> TaskResponse:
    row = service.get_task(task_id)
    set_etag(response, row.version)
    return TaskResponse.model_validate(row)


@router.patch(
    "/tasks/{task_id}",
    response_model=TaskResponse,
    responses={412: {"description": "ETag is stale"}},
)
def update_task(
    task_id: Annotated[int, Path(ge=1)],
    payload: TaskPatch,
    expected_version: ExpectedVersionDep,
    response: Response,
    service: ServiceDep,
) -> TaskResponse:
    row = service.update_task(task_id, expected_version, payload)
    set_etag(response, row.version)
    return TaskResponse.model_validate(row)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: Annotated[int, Path(ge=1)], service: ServiceDep
) -> None:
    service.delete_project(project_id)
