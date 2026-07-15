"""A typed application boundary around untrusted source values."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Protocol

from .models import Page, Task
from .parsing import parse_task
from .query import paginate


class TaskSource(Protocol):
    def read(self) -> Iterable[object]: ...


class TaskCatalog:
    def __init__(self, source: TaskSource) -> None:
        self._source = source

    def page(
        self,
        *,
        offset: int,
        limit: int,
        predicate: Callable[[Task], bool] | None = None,
    ) -> Page[Task]:
        tasks = tuple(parse_task(value) for value in self._source.read())
        selected = tasks if predicate is None else tuple(filter(predicate, tasks))
        return paginate(selected, offset=offset, limit=limit)
