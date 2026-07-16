import re
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from .database import SessionFactory
from .errors import InvalidEntityTagError
from .repository import ProjectTaskRepository
from .service import ProjectTaskService


def get_session(request: Request) -> Iterator[Session]:
    factory: SessionFactory = request.app.state.session_factory
    with factory() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_service(session: SessionDep) -> ProjectTaskService:
    return ProjectTaskService(session, ProjectTaskRepository(session))


ServiceDep = Annotated[ProjectTaskService, Depends(get_service)]


def parse_if_match(if_match: Annotated[str, Header(alias="If-Match")]) -> int:
    match = re.fullmatch(r'"([1-9][0-9]*)"', if_match)
    if match is None:
        raise InvalidEntityTagError
    return int(match.group(1))


ExpectedVersionDep = Annotated[int, Depends(parse_if_match)]
