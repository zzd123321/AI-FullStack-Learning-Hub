"""Values shared by the concurrency implementations."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Job:
    id: str
    delay: float
    fail: bool = False

    def __post_init__(self) -> None:
        if not self.id:
            raise ValueError("job id must not be empty")
        if self.delay < 0:
            raise ValueError("job delay must not be negative")


@dataclass(frozen=True, slots=True)
class JobResult:
    job_id: str
    worker: str


class JobError(RuntimeError):
    """A simulated external operation failed."""
