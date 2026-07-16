import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from .model import FakeLanguageModel
from .service import (
    CapacityLease,
    CapacityExceededError,
    InferenceService,
    InferenceTimeoutError,
)


class LeaseStreamingResponse(StreamingResponse):
    """即使 body generator 尚未启动就被取消，也归还 admission lease。"""

    def __init__(self, content: AsyncIterator[bytes], lease: CapacityLease) -> None:
        super().__init__(content, media_type="application/jsonl")
        self.lease = lease

    async def __call__(self, scope, receive, send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self.lease.release()


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    prompt: str = Field(min_length=1, max_length=2_000)
    max_tokens: int = Field(default=32, ge=1, le=256)
    token_delay: float = Field(default=0.01, ge=0, le=1)
    queue_timeout: float = Field(default=0.05, gt=0, le=5)
    inference_timeout: float = Field(default=5, gt=0, le=30)


class GenerateResponse(BaseModel):
    text: str


def json_line(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def create_app(
    model: FakeLanguageModel | None = None, max_concurrency: int = 2
) -> FastAPI:
    service = InferenceService(model or FakeLanguageModel(), max_concurrency)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await service.start()
        app.state.inference = service
        try:
            yield
        finally:
            await service.stop()

    app = FastAPI(title="Capacity-aware Inference API", lifespan=lifespan)

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "alive"}

    @app.get("/health/ready")
    async def ready() -> dict[str, str]:
        if not service.model.loaded:
            raise HTTPException(status_code=503, detail="model is not ready")
        return {"status": "ready"}

    @app.post("/api/v1/generate", response_model=GenerateResponse)
    async def generate(payload: GenerateRequest) -> GenerateResponse:
        try:
            text = await service.complete(
                payload.prompt,
                payload.max_tokens,
                payload.token_delay,
                payload.queue_timeout,
                payload.inference_timeout,
            )
        except CapacityExceededError as error:
            raise HTTPException(
                status_code=503,
                detail=str(error),
                headers={"Retry-After": "1"},
            ) from error
        except InferenceTimeoutError as error:
            raise HTTPException(status_code=504, detail=str(error)) from error
        return GenerateResponse(text=text)

    @app.post("/api/v1/generate/stream", response_class=StreamingResponse)
    async def generate_stream(
        payload: GenerateRequest, request: Request
    ) -> StreamingResponse:
        try:
            lease = await service.reserve(payload.queue_timeout)
        except CapacityExceededError as error:
            raise HTTPException(
                status_code=503,
                detail=str(error),
                headers={"Retry-After": "1"},
            ) from error

        async def body() -> AsyncIterator[bytes]:
            try:
                async for token in service.stream(
                    lease,
                    payload.prompt,
                    payload.max_tokens,
                    payload.token_delay,
                    payload.inference_timeout,
                ):
                    if await request.is_disconnected():
                        break
                    yield json_line(
                        {"type": "token", "index": token.index, "text": token.text}
                    )
                else:
                    yield json_line({"type": "done"})
            except InferenceTimeoutError as error:
                yield json_line({"type": "error", "code": "deadline", "detail": str(error)})
            except asyncio.CancelledError:
                raise  # model generator 和 lease 的 finally 负责清理

        return LeaseStreamingResponse(body(), lease)

    return app
