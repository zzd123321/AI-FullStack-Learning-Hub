"""Use cases and explicit transaction boundaries."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .errors import DuplicateTaskTitleError, TaskNotFoundError
from .models import TaskCreate
from .orm import TaskRow, TaskStatus
from .repository import SqlAlchemyTaskRepository


class TaskService:
    def __init__(self, session: Session, repository: SqlAlchemyTaskRepository) -> None:
        self._session = session
        self._repository = repository

    def create(self, payload: TaskCreate) -> TaskRow:
        return self.create_batch([payload])[0]

    def create_batch(self, payloads: list[TaskCreate]) -> list[TaskRow]:
        rows: list[TaskRow] = []
        try:
            with self._session.begin():
                for payload in payloads:
                    rows.append(self._repository.add(payload))
                self._session.flush()
        except IntegrityError as error:
            raise DuplicateTaskTitleError from error
        return rows

    def get(self, task_id: int) -> TaskRow:
        row = self._repository.get(task_id)
        if row is None:
            raise TaskNotFoundError(task_id)
        return row

    def list(
        self,
        *,
        status: TaskStatus | None,
        offset: int,
        limit: int,
    ) -> tuple[list[TaskRow], int]:
        return self._repository.list(status=status, offset=offset, limit=limit)
