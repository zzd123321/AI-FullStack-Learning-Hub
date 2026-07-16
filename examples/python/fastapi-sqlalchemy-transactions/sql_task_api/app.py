"""FastAPI composition root."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import Settings
from .database import create_database_engine, create_session_factory
from .dependencies import SessionDep
from .errors import DuplicateTaskTitleError, TaskNotFoundError
from .models import ErrorBody, ErrorResponse, HealthResponse
from .router import router


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings()
    engine = create_database_engine(resolved_settings)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        del application
        try:
            yield
        finally:
            engine.dispose()

    application = FastAPI(
        title=resolved_settings.app_name,
        version="3.0.0",
        lifespan=lifespan,
    )
    application.state.session_factory = session_factory
    application.include_router(router, prefix="/api/v1")

    @application.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
    def health(session: SessionDep) -> HealthResponse:
        session.execute(text("SELECT 1"))
        return HealthResponse(status="ready")

    @application.exception_handler(TaskNotFoundError)
    async def task_not_found_handler(
        request: Request, error: TaskNotFoundError
    ) -> JSONResponse:
        del request
        body = ErrorResponse(
            error=ErrorBody(
                code="task_not_found",
                message=f"Task {error.task_id} was not found",
            )
        )
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content=body.model_dump())

    @application.exception_handler(DuplicateTaskTitleError)
    async def duplicate_title_handler(
        request: Request, error: DuplicateTaskTitleError
    ) -> JSONResponse:
        del request, error
        body = ErrorResponse(
            error=ErrorBody(
                code="duplicate_task_title",
                message="A task with the same title already exists",
            )
        )
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body.model_dump())

    return application


app = create_app()
