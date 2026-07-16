"""SQLAlchemy implementation of the task repository."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import TaskCreate
from .orm import TaskRow, TaskStatus


class SqlAlchemyTaskRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, payload: TaskCreate) -> TaskRow:
        row = TaskRow(**payload.model_dump())
        self._session.add(row)
        return row

    def get(self, task_id: int) -> TaskRow | None:
        return self._session.get(TaskRow, task_id)

    def list(
        self,
        *,
        status: TaskStatus | None,
        offset: int,
        limit: int,
    ) -> tuple[list[TaskRow], int]:
        filters = [] if status is None else [TaskRow.status == status]
        total = self._session.scalar(
            select(func.count()).select_from(TaskRow).where(*filters)
        )
        rows = self._session.scalars(
            select(TaskRow)
            .where(*filters)
            .order_by(TaskRow.id)
            .offset(offset)
            .limit(limit)
        ).all()
        return list(rows), total or 0
