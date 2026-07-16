import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from inference_api.app import create_app
from inference_api.model import FakeLanguageModel
from inference_api.service import (
    CapacityExceededError,
    InferenceService,
    InferenceTimeoutError,
)


def test_lifespan_loads_model_and_unloads_it() -> None:
    model = FakeLanguageModel()
    app = create_app(model)
    assert model.loaded is False
    with TestClient(app) as client:
        assert client.get("/health/ready").json() == {"status": "ready"}
        assert model.loaded is True
    assert model.loaded is False


def test_non_streaming_generation() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/generate",
            json={"prompt": "理解背压", "max_tokens": 3, "token_delay": 0},
        )
    assert response.status_code == 200
    assert response.json() == {"text": "AI 回答： 理解背压"}


def test_overload_rejects_instead_of_building_an_unbounded_queue() -> None:
    async def scenario() -> None:
        model = FakeLanguageModel()
        service = InferenceService(model, max_concurrency=1)
        await service.start()
        first = asyncio.create_task(
            service.complete("first", 3, 0.05, 0.1, 1)
        )
        await model.generation_started.wait()
        with pytest.raises(CapacityExceededError):
            await service.complete("second", 3, 0, 0.001, 1)
        await first
        assert model.maximum_active_generations == 1
        await service.stop()

    asyncio.run(scenario())


def test_timeout_cancels_generation_and_releases_capacity() -> None:
    async def scenario() -> None:
        model = FakeLanguageModel()
        service = InferenceService(model, max_concurrency=1)
        await service.start()
        with pytest.raises(InferenceTimeoutError):
            await service.complete("slow", 3, 0.05, 0.1, 0.01)
        assert service.active == 0
        assert model.active_generations == 0
        assert await service.complete("next", 3, 0, 0.1, 1) == "AI 回答： next"
        await service.stop()

    asyncio.run(scenario())


def test_caller_cancellation_is_not_swallowed() -> None:
    async def scenario() -> None:
        model = FakeLanguageModel()
        service = InferenceService(model, max_concurrency=1)
        await service.start()
        task = asyncio.create_task(service.complete("cancel", 3, 1, 0.1, 10))
        await model.generation_started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert service.active == model.active_generations == 0
        await service.stop()

    asyncio.run(scenario())


def test_json_lines_stream_has_typed_terminal_event() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/generate/stream",
            json={"prompt": "流式结果", "max_tokens": 3, "token_delay": 0},
        )
    lines = [json.loads(line) for line in response.text.splitlines()]
    assert response.headers["content-type"].startswith("application/jsonl")
    assert [line["type"] for line in lines] == ["token", "token", "token", "done"]
    assert lines[2]["text"] == "流式结果"


def test_stream_reports_timeout_inside_protocol_after_headers_started() -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/generate/stream",
            json={
                "prompt": "slow stream",
                "max_tokens": 3,
                "token_delay": 0.05,
                "inference_timeout": 0.01,
            },
        )
        assert response.status_code == 200
        assert [json.loads(line)["type"] for line in response.text.splitlines()] == [
            "error"
        ]
        assert app.state.inference.active == 0
