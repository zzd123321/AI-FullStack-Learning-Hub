from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from .errors import DuplicateResourceError, ResourceNotFoundError, VersionConflictError
from .models import ProjectCreate, TaskCreate, TaskPatch
from .orm import ProjectRow, TaskRow
from .repository import ProjectTaskRepository


class ProjectTaskService:
    def __init__(self, session: Session, repository: ProjectTaskRepository) -> None:
        self.session = session
        self.repository = repository

    def create_project(self, payload: ProjectCreate) -> ProjectRow:
        return self._write(lambda: self.repository.add_project(payload))

    def create_task(self, project_id: int, payload: TaskCreate) -> TaskRow:
        def operation() -> TaskRow:
            if self.repository.get_project(project_id) is None:
                raise ResourceNotFoundError("project not found")
            return self.repository.add_task(project_id, payload)
        return self._write(operation)

    def list_projects(self) -> list[ProjectRow]:
        return self.repository.list_projects_with_tasks()

    def get_task(self, task_id: int) -> TaskRow:
        row = self.repository.get_task(task_id)
        if row is None:
            raise ResourceNotFoundError("task not found")
        return row

    def update_task(
        self, task_id: int, expected_version: int, payload: TaskPatch
    ) -> TaskRow:
        try:
            with self.session.begin():
                row = self.get_task(task_id)
                if row.version != expected_version:
                    raise VersionConflictError
                for name, value in payload.model_dump(exclude_unset=True).items():
                    setattr(row, name, value)
                self.session.flush()
                return row
        except StaleDataError as error:
            raise VersionConflictError from error

    def delete_project(self, project_id: int) -> None:
        with self.session.begin():
            project = self.repository.get_project(project_id)
            if project is None:
                raise ResourceNotFoundError("project not found")
            self.repository.delete_project(project)

    def _write(self, operation):
        try:
            with self.session.begin():
                row = operation()
                self.session.flush()
                return row
        except IntegrityError as error:
            raise DuplicateResourceError from error
