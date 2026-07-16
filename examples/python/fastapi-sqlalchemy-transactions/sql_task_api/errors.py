"""Application errors mapped to HTTP at the outer boundary."""


class TaskNotFoundError(Exception):
    def __init__(self, task_id: int) -> None:
        self.task_id = task_id
        super().__init__(f"task {task_id} was not found")


class DuplicateTaskTitleError(Exception):
    pass
