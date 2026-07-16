from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient

from relationship_api.app import create_app
from relationship_api.config import Settings

ROOT = Path(__file__).parents[1]


def migrate(url: str) -> None:
    config = Config(ROOT / "alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


@pytest.fixture
def application(tmp_path: Path) -> Iterator[FastAPI]:
    url = f"sqlite:///{tmp_path / 'test.db'}"
    migrate(url)
    app = create_app(Settings(database_url=url))
    yield app
    app.state.session_factory.kw["bind"].dispose()


@pytest.fixture
def client(application: FastAPI) -> Iterator[TestClient]:
    with TestClient(application) as test_client:
        yield test_client


def create_project_and_task(client: TestClient, suffix: str = "") -> tuple[int, int]:
    project = client.post("/api/v1/projects", json={"name": f"Project{suffix}"})
    project_id = project.json()["id"]
    task = client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={"title": f"Task{suffix}", "priority": 3},
    )
    return project_id, task.json()["id"]
