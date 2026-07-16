import json
from collections.abc import AsyncIterable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request, Response
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, ConfigDict, Field

from .storage import EventStore, IdempotencyConflictError


class JobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)


def create_app(database_path: Path | None = None) -> FastAPI:
    store = EventStore(database_path or Path("events.db"))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        store.close()

    app = FastAPI(title="Outbox Learning API", lifespan=lifespan)
    app.state.store = store
    app.state.best_effort: list[str] = []

    @app.post("/api/v1/jobs", status_code=202)
    def create_job(
        payload: JobCreate,
        response: Response,
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=64)],
    ) -> dict:
        try:
            result, replayed = app.state.store.create_job(idempotency_key, payload.name)
        except IdempotencyConflictError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        response.headers["Idempotency-Replayed"] = str(replayed).lower()
        return result

    @app.post("/api/v1/best-effort", status_code=202)
    def best_effort(payload: JobCreate, background: BackgroundTasks) -> dict[str, str]:
        background.add_task(app.state.best_effort.append, payload.name)
        return {"status": "scheduled-in-process"}

    @app.get("/api/v1/events", response_class=EventSourceResponse)
    async def events(
        request: Request,
        last_event_id: Annotated[int | None, Header(alias="Last-Event-ID")] = None,
    ) -> AsyncIterable[ServerSentEvent]:
        for event in app.state.store.events_after(last_event_id or 0):
            if await request.is_disconnected():
                break
            yield ServerSentEvent(
                data=json.loads(event["payload"]),
                event=event["event_type"],
                id=str(event["id"]),
                retry=3000,
            )

    return app
