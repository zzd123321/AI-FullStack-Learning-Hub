"""Application composition root."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .errors import PageSizeExceededError, TaskNotFoundError
from .models import ErrorBody, ErrorResponse
from .repository import InMemoryTaskRepository
from .routers import system, tasks


def create_app(settings: Settings | None = None) -> FastAPI:
    # 测试可显式传 settings；真实启动才从环境读取，避免 import 时偷偷依赖本机配置。
    resolved_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        # repository 属于整个应用生命周期，但会通过 dependency 显式提供给每次请求。
        repository = InMemoryTaskRepository()
        application.state.repository = repository
        application.state.request_events = []
        try:
            yield
        finally:
            await repository.close()

    application = FastAPI(
        title=resolved_settings.app_name,
        version="2.0.0",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings

    application.include_router(system.router, prefix="/api/v1")
    application.include_router(tasks.router, prefix="/api/v1")

    @application.exception_handler(TaskNotFoundError)
    async def task_not_found_handler(
        request: Request, error: TaskNotFoundError
    ) -> JSONResponse:
        del request
        # 领域错误在最外层 HTTP 边界统一转换，service 不需要知道 404。
        body = ErrorResponse(
            error=ErrorBody(
                code="task_not_found",
                message=f"Task {error.task_id} was not found",
            )
        )
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=body.model_dump())

    @application.exception_handler(PageSizeExceededError)
    async def page_size_handler(
        request: Request, error: PageSizeExceededError
    ) -> JSONResponse:
        del request
        body = ErrorResponse(
            error=ErrorBody(
                code="page_size_exceeded",
                message=f"limit must not exceed {error.maximum}",
            )
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=body.model_dump(),
        )

    @application.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        del request
        # Pydantic 的 ctx 可能含 Exception 对象；先转成字符串才能安全 JSON 序列化。
        details = error.errors()
        for detail in details:
            context = detail.get("ctx")
            if isinstance(context, dict) and isinstance(context.get("error"), Exception):
                context["error"] = str(context["error"])
        body = ErrorResponse(
            error=ErrorBody(
                code="request_validation_failed",
                message="Request parameters or body are invalid",
                details=jsonable_encoder(details),
            )
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=body.model_dump(),
        )

    return application


app = create_app()
