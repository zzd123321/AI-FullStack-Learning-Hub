from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from sql_task_api.app import create_app
from sql_task_api.config import Settings

PROJECT_ROOT = Path(__file__).parents[1]


def migrate(database_url: str) -> None:
    configuration = Config(PROJECT_ROOT / "alembic.ini")
    configuration.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(configuration, "head")


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    migrate(database_url)
    application = create_app(Settings(database_url=database_url))
    with TestClient(application) as test_client:
        yield test_client
