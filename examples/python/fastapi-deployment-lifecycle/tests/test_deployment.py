import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from deployment_api.app import create_app
from deployment_api.lifecycle import DeploymentState
from deployment_api.middleware import InFlightMiddleware
from deployment_api.settings import Settings


def test_settings_are_validated_at_startup_boundary() -> None:
    settings = Settings.from_environment(
        {
            "APP_ENV": "production",
            "APP_RELEASE": "2026.07.16-abc123",
            "SHUTDOWN_DRAIN_SECONDS": "15",
        }
    )
    assert settings.environment == "production"
    assert settings.shutdown_drain_seconds == 15
    with pytest.raises(ValidationError):
        Settings.from_environment({"APP_ENV": "unknown"})


def test_lifespan_controls_readiness_and_records_drain() -> None:
    app = create_app(Settings(environment="test", shutdown_drain_seconds=0.1))
    with TestClient(app) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 200
        assert app.state.deployment.ready is True
    assert app.state.deployment.ready is False
    assert app.state.deployment.draining is True
    assert app.state.deployment.last_drain_completed is True


def test_draining_rejects_business_requests_but_keeps_health_visible() -> None:
    app = create_app(Settings(environment="test"))
    with TestClient(app) as client:
        client.portal.call(app.state.deployment.begin_drain)
        rejected = client.get("/api/v1/work")
        assert rejected.status_code == 503
        assert rejected.headers["retry-after"] == "1"
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 503


def test_release_header_identifies_the_serving_revision() -> None:
    app = create_app(Settings(environment="test", release="release-42"))
    with TestClient(app) as client:
        response = client.get("/api/v1/work")
    assert response.headers["x-app-release"] == "release-42"


def test_pure_asgi_middleware_tracks_until_final_stream_body() -> None:
    async def scenario() -> None:
        state = DeploymentState(ready=True)
        first_chunk_sent = asyncio.Event()
        allow_finish = asyncio.Event()

        async def streaming_app(scope, receive, send) -> None:
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"first", "more_body": True})
            first_chunk_sent.set()
            await allow_finish.wait()
            await send({"type": "http.response.body", "body": b"last"})

        middleware = InFlightMiddleware(streaming_app, state, "test-release")
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            sent.append(message)

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/v1/stream",
            "raw_path": b"/api/v1/stream",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 1),
            "server": ("test", 80),
        }
        task = asyncio.create_task(middleware(scope, receive, send))
        await first_chunk_sent.wait()
        assert state.in_flight == 1
        allow_finish.set()
        await task
        assert state.in_flight == 0
        assert sent[-1]["body"] == b"last"

    asyncio.run(scenario())


def test_drain_waits_for_in_flight_work_and_has_a_deadline() -> None:
    async def scenario() -> None:
        state = DeploymentState(ready=True)
        await state.begin_request()
        await state.begin_drain()
        assert await state.wait_until_idle(0.001) is False
        await state.finish_request()
        assert await state.wait_until_idle(0.1) is True

    asyncio.run(scenario())
