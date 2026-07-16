from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from .bootstrap import build_container
from .catalog.api import router as catalog_router
from .orders.api import router as orders_router


def create_app(database_path: Path | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = build_container(database_path or Path("orders.db"))
        yield

    app = FastAPI(title="Modular Monolith API", lifespan=lifespan)
    app.include_router(catalog_router)
    app.include_router(orders_router)
    return app
