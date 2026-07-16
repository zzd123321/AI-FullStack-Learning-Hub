"""Application errors that are independent of HTTP response objects."""


class TaskNotFoundError(Exception):
    def __init__(self, task_id: int) -> None:
        self.task_id = task_id
        super().__init__(f"task {task_id} was not found")


class PageSizeExceededError(Exception):
    def __init__(self, requested: int, maximum: int) -> None:
        self.requested = requested
        self.maximum = maximum
        super().__init__(f"requested page size {requested} exceeds maximum {maximum}")
