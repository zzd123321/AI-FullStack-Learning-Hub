from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from modular_api.app import create_app
from modular_api.config import Settings
from modular_api.dependencies import get_repository
from modular_api.models import TaskCreate, TaskQuery
from modular_api.repository import TaskRecord


@contextmanager
def client_for(settings: Settings | None = None) -> Iterator[tuple[TestClient, FastAPI]]:
    application = create_app(settings or Settings(environment="test"))
    with TestClient(application) as client:
        yield client, application


def valid_task(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "title": "Understand dependency graphs",
        "description": "Trace provider resolution and cleanup",
        "priority": 4,
        "tags": ["FastAPI", " Backend "],
        "starts_at": "2026-07-16T09:00:00+08:00",
        "ends_at": "2026-07-16T10:00:00+08:00",
    }
    body.update(overrides)
    return body


def test_settings_reads_prefixed_environment_and_validates_values() -> None:
    environment = {
        "TASK_API_APP_NAME": "Environment API",
        "TASK_API_ENVIRONMENT": "production",
        "TASK_API_MAX_PAGE_SIZE": "25",
    }
    with patch.dict(os.environ, environment, clear=True):
        settings = Settings(_env_file=None)

    assert settings.app_name == "Environment API"
    assert settings.environment == "production"
    assert settings.max_page_size == 25


def test_health_uses_explicit_application_settings() -> None:
    settings = Settings(app_name="Test Task API", environment="test", max_page_size=10)
    with client_for(settings) as (client, _):
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "application": "Test Task API",
        "environment": "test",
    }


def test_create_normalizes_model_and_reuses_request_dependency() -> None:
    with client_for() as (client, application):
        response = client.post(
            "/api/v1/tasks",
            headers={"X-Request-ID": "request-123"},
            json=valid_task(),
        )
        events = list(application.state.request_events)

    assert response.status_code == 201
    assert response.headers["location"] == "/api/v1/tasks/1"
    assert response.headers["x-request-id"] == "request-123"
    assert response.json()["tags"] == ["fastapi", "backend"]
    assert events == ["open:request-123", "close:request-123"]


def test_cross_field_validation_rejects_invalid_time_range() -> None:
    with client_for() as (client, _):
        response = client.post(
            "/api/v1/tasks",
            json=valid_task(ends_at="2026-07-16T08:00:00+08:00"),
        )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request_validation_failed"
    assert "ends_at must be later" in response.json()["error"]["details"][0]["ctx"]["error"]


def test_query_model_rejects_unknown_parameter() -> None:
    with client_for() as (client, _):
        response = client.get("/api/v1/tasks?unexpected=true")

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["type"] == "extra_forbidden"


def test_dependency_enforces_environment_specific_page_limit() -> None:
    settings = Settings(environment="test", max_page_size=5)
    with client_for(settings) as (client, _):
        response = client.get("/api/v1/tasks?limit=6")

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "page_size_exceeded",
        "message": "limit must not exceed 5",
        "details": None,
    }


class FakeRepository:
    async def create(self, payload: TaskCreate) -> TaskRecord:
        return TaskRecord(id=99, **payload.model_dump())

    async def get(self, task_id: int) -> TaskRecord | None:
        return TaskRecord(
            id=task_id,
            title="Provided by a test double",
            description=None,
            priority=5,
        )

    async def list(self, query: TaskQuery) -> tuple[list[TaskRecord], int]:
        del query
        return [], 0


def test_dependency_override_replaces_repository_boundary() -> None:
    application = create_app(Settings(environment="test"))
    application.dependency_overrides[get_repository] = FakeRepository

    with TestClient(application) as client:
        response = client.get("/api/v1/tasks/7")

    assert response.status_code == 200
    assert response.json()["id"] == 7
    assert response.json()["title"] == "Provided by a test double"


def test_router_prefix_and_models_are_present_in_openapi() -> None:
    application = create_app(Settings(environment="test"))
    schema = application.openapi()

    assert "/api/v1/tasks" in schema["paths"]
    assert "/api/v1/tasks/{task_id}" in schema["paths"]
    assert "TaskCreate" in schema["components"]["schemas"]
    assert "TaskPage" in schema["components"]["schemas"]
