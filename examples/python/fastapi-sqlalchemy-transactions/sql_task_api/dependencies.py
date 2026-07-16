"""Request-scoped Session, repository, and service providers."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .database import SessionFactory
from .repository import SqlAlchemyTaskRepository
from .service import TaskService


def get_session(request: Request) -> Iterator[Session]:
    factory: SessionFactory = request.app.state.session_factory
    with factory() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_task_repository(session: SessionDep) -> SqlAlchemyTaskRepository:
    return SqlAlchemyTaskRepository(session)


RepositoryDep = Annotated[SqlAlchemyTaskRepository, Depends(get_task_repository)]


def get_task_service(session: SessionDep, repository: RepositoryDep) -> TaskService:
    return TaskService(session, repository)


TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
