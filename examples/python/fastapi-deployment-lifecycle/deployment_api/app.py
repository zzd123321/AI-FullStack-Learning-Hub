import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .lifecycle import DeploymentState
from .middleware import InFlightMiddleware
from .settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings.from_environment()
    state = DeploymentState()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.deployment = state
        app.state.settings = config
        await state.mark_started()
        try:
            yield
        finally:
            await state.begin_drain()
            state.last_drain_completed = await state.wait_until_idle(
                config.shutdown_drain_seconds
            )

    app = FastAPI(title="Deployment Lifecycle API", lifespan=lifespan)
    app.add_middleware(
        InFlightMiddleware,
        state=state,
        release=config.release,
    )

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "alive"}

    @app.get("/health/ready")
    async def ready() -> dict[str, str]:
        if not state.ready or state.draining:
            raise HTTPException(status_code=503, detail="instance is not ready")
        return {"status": "ready"}

    @app.get("/api/v1/work")
    async def work(delay: float = 0.01) -> dict[str, str]:
        await asyncio.sleep(min(max(delay, 0), 1))
        return {"status": "completed", "release": config.release}

    @app.get("/api/v1/stream", response_class=StreamingResponse)
    async def stream() -> StreamingResponse:
        async def body() -> AsyncIterator[bytes]:
            yield b"first\n"
            await asyncio.sleep(0.01)
            yield b"second\n"

        return StreamingResponse(body(), media_type="text/plain")

    return app
