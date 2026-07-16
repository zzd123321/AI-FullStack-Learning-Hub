from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import ProjectCreate, TaskCreate
from .orm import ProjectRow, TaskRow


class ProjectTaskRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add_project(self, payload: ProjectCreate) -> ProjectRow:
        row = ProjectRow(name=payload.name)
        self.session.add(row)
        return row

    def get_project(self, project_id: int) -> ProjectRow | None:
        return self.session.get(ProjectRow, project_id)

    def list_projects_with_tasks(self) -> list[ProjectRow]:
        statement = (
            select(ProjectRow)
            .options(selectinload(ProjectRow.tasks))
            .order_by(ProjectRow.id)
        )
        return list(self.session.scalars(statement).all())

    def add_task(self, project_id: int, payload: TaskCreate) -> TaskRow:
        row = TaskRow(project_id=project_id, **payload.model_dump())
        self.session.add(row)
        return row

    def get_task(self, task_id: int) -> TaskRow | None:
        return self.session.get(TaskRow, task_id)

    def delete_project(self, project: ProjectRow) -> None:
        self.session.delete(project)
