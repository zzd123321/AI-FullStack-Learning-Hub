from fastapi import FastAPI
import pytest
from sqlalchemy import event, select, text
from sqlalchemy.orm.exc import StaleDataError

from relationship_api.orm import ProjectRow, TaskRow
from relationship_api.repository import ProjectTaskRepository


def test_selectin_loading_uses_two_selects_for_multiple_projects(application: FastAPI) -> None:
    factory = application.state.session_factory
    with factory.begin() as session:
        for number in range(3):
            project = ProjectRow(name=f"P{number}")
            project.tasks.append(TaskRow(title=f"T{number}", priority=3))
            session.add(project)

    engine = factory.kw["bind"]
    selects: list[str] = []

    def count_selects(_, __, statement: str, *args) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    event.listen(engine, "before_cursor_execute", count_selects)
    try:
        with factory() as session:
            projects = ProjectTaskRepository(session).list_projects_with_tasks()
            assert sum(len(project.tasks) for project in projects) == 3
    finally:
        event.remove(engine, "before_cursor_execute", count_selects)
    assert len(selects) == 2


def test_version_column_detects_two_session_race(application: FastAPI) -> None:
    factory = application.state.session_factory
    with factory.begin() as seed:
        project = ProjectRow(name="Race")
        project.tasks.append(TaskRow(title="Original", priority=3))
        seed.add(project)
    with factory() as first, factory() as second:
        row1 = first.scalar(select(TaskRow))
        row2 = second.scalar(select(TaskRow))
        assert row1 is not None and row2 is not None
        row1.title = "First commit"
        first.commit()
        row2.title = "Stale commit"
        with pytest.raises(StaleDataError):
            second.commit()
        second.rollback()


def test_sqlite_foreign_keys_are_enabled(application: FastAPI) -> None:
    factory = application.state.session_factory
    with factory() as session:
        assert session.scalar(text("PRAGMA foreign_keys")) == 1
