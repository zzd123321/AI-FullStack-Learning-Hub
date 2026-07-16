"""Dependency providers and reusable Annotated aliases."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, Header, Query, Request

from .config import Settings
from .errors import PageSizeExceededError
from .models import TaskQuery
from .repository import TaskRepository


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_repository(request: Request) -> TaskRepository:
    return request.app.state.repository


SettingsDep = Annotated[Settings, Depends(get_settings)]
RepositoryDep = Annotated[TaskRepository, Depends(get_repository)]


async def open_request_context(
    request: Request,
    x_request_id: Annotated[
        str | None,
        Header(alias="X-Request-ID", min_length=8, max_length=64),
    ] = None,
) -> AsyncIterator[RequestContext]:
    request_id = x_request_id or uuid4().hex
    request.app.state.request_events.append(f"open:{request_id}")
    try:
        yield RequestContext(request_id=request_id)
    finally:
        request.app.state.request_events.append(f"close:{request_id}")


RequestContextDep = Annotated[RequestContext, Depends(open_request_context)]


def enforce_page_size(
    query: Annotated[TaskQuery, Query()], settings: SettingsDep
) -> TaskQuery:
    if query.limit > settings.max_page_size:
        raise PageSizeExceededError(query.limit, settings.max_page_size)
    return query


TaskQueryDep = Annotated[TaskQuery, Depends(enforce_page_size)]
