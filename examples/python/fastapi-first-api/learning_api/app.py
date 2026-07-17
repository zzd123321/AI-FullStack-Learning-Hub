"""FastAPI application factory and HTTP endpoints."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .models import ErrorBody, ErrorResponse, TaskCreate, TaskResponse
from .store import TaskNotFoundError, TaskStore


def get_store(request: Request) -> TaskStore:
    return request.app.state.task_store


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    # 每个 worker 进程各执行一次 lifespan，并拥有自己的一份 store。
    application.state.task_store = TaskStore()
    application.state.ready = True
    try:
        # yield 之前是启动阶段；yield 之后等待 ASGI server 请求关闭应用。
        yield
    finally:
        # 无论正常关闭还是启动后的异常退出，都把共享资源清理放在 finally。
        application.state.ready = False
        await application.state.task_store.close()


def create_app() -> FastAPI:
    # application factory 让测试或不同运行环境可以创建彼此隔离的 app 实例。
    application = FastAPI(
        title="Learning Task API",
        version="1.0.0",
        lifespan=lifespan,
    )

    @application.exception_handler(TaskNotFoundError)
    async def task_not_found_handler(
        request: Request, error: TaskNotFoundError
    ) -> JSONResponse:
        del request
        response = ErrorResponse(
            error=ErrorBody(
                code="task_not_found",
                message=f"Task {error.task_id} was not found",
            )
        )
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=response.model_dump())

    @application.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        del request
        response = ErrorResponse(
            error=ErrorBody(
                code="request_validation_failed",
                message="Request parameters or body are invalid",
                details=error.errors(),
            )
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=jsonable_encoder(response),
        )

    @application.get("/health", tags=["system"])
    async def health(request: Request) -> dict[str, str]:
        state = "ready" if request.app.state.ready else "starting"
        return {"status": state}

    @application.post(
        "/api/tasks",
        response_model=TaskResponse,
        status_code=status.HTTP_201_CREATED,
        responses={422: {"model": ErrorResponse}},
        tags=["tasks"],
    )
    async def create_task(
        payload: TaskCreate, request: Request, response: Response
    ) -> TaskResponse:
        # 执行到这里时 payload 已通过 Pydantic 解析和校验。
        task = await get_store(request).create(title=payload.title, priority=payload.priority)
        response.headers["Location"] = f"/api/tasks/{task.id}"
        return TaskResponse.model_validate(task)

    @application.get(
        "/api/tasks/{task_id}",
        response_model=TaskResponse,
        responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
        tags=["tasks"],
    )
    async def get_task(task_id: int, request: Request) -> TaskResponse:
        task = await get_store(request).get(task_id)
        return TaskResponse.model_validate(task)

    return application


app = create_app()
