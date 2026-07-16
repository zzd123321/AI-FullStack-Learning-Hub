from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from .conftest import migrate


def test_upgrade_creates_expected_schema_and_records_revision(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'schema.db'}"
    migrate(database_url)
    engine = create_engine(database_url)
    inspector = inspect(engine)

    assert {"alembic_version", "tasks"}.issubset(inspector.get_table_names())
    assert "uq_tasks_title" in {
        constraint["name"] for constraint in inspector.get_unique_constraints("tasks")
    }
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
            "20260716_01"
        )
    engine.dispose()
