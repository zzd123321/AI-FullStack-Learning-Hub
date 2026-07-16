from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from .config import Settings
from .database import build_engine, build_session_factory
from .errors import DuplicateResourceError, InvalidEntityTagError, ResourceNotFoundError, VersionConflictError
from .models import ErrorBody, ErrorResponse
from .router import router


def create_app(settings: Settings | None = None) -> FastAPI:
    engine = build_engine(settings or Settings())
    factory = build_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Relationship Task API", version="4.0.0", lifespan=lifespan)
    app.state.session_factory = factory
    app.include_router(router)

    def error(status_code: int, code: str, message: str) -> JSONResponse:
        body = ErrorResponse(error=ErrorBody(code=code, message=message))
        return JSONResponse(status_code=status_code, content=body.model_dump())

    @app.exception_handler(ResourceNotFoundError)
    async def not_found(_: Request, __: ResourceNotFoundError) -> JSONResponse:
        return error(404, "resource_not_found", "The requested resource was not found")

    @app.exception_handler(DuplicateResourceError)
    async def duplicate(_: Request, __: DuplicateResourceError) -> JSONResponse:
        return error(409, "duplicate_resource", "A unique value already exists")

    @app.exception_handler(VersionConflictError)
    async def stale(_: Request, __: VersionConflictError) -> JSONResponse:
        return error(status.HTTP_412_PRECONDITION_FAILED, "stale_version", "Reload before updating")

    @app.exception_handler(InvalidEntityTagError)
    async def invalid_etag(_: Request, __: InvalidEntityTagError) -> JSONResponse:
        return error(400, "invalid_if_match", "If-Match must be a quoted positive version")

    return app


app = create_app()
