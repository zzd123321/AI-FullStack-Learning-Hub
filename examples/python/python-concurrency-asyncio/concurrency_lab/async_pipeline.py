"""Structured asynchronous jobs with bounded concurrency and cleanup."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from .models import Job, JobError, JobResult


@dataclass(slots=True)
class ActivityProbe:
    active: int = 0
    maximum_active: int = 0
    started: list[str] = field(default_factory=list)
    finished: list[str] = field(default_factory=list)
    cancelled: list[str] = field(default_factory=list)

    def enter(self, job_id: str) -> None:
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        self.started.append(job_id)

    def exit(self, job_id: str) -> None:
        self.active -= 1
        self.finished.append(job_id)


async def _fetch_async(job: Job, probe: ActivityProbe) -> JobResult:
    probe.enter(job.id)
    try:
        # asyncio.sleep 是可等待点；当前 Task 暂停时 event loop 可以推进其他 Task。
        await asyncio.sleep(job.delay)
        if job.fail:
            raise JobError(f"job failed: {job.id}")
        return JobResult(job.id, "event-loop")
    except asyncio.CancelledError:
        probe.cancelled.append(job.id)
        # 记录后必须重新抛出，让 TaskGroup/timeout 正确观察取消状态。
        raise
    finally:
        probe.exit(job.id)


async def _bounded_fetch(
    job: Job, semaphore: asyncio.Semaphore, probe: ActivityProbe
) -> JobResult:
    # Semaphore 限制真正进入外部操作的任务数，Task 数量不等于下游并发量。
    async with semaphore:
        return await _fetch_async(job, probe)


async def run_async(
    jobs: list[Job],
    *,
    concurrency: int,
    timeout: float,
    probe: ActivityProbe | None = None,
) -> tuple[JobResult, ...]:
    if concurrency <= 0:
        raise ValueError("concurrency must be positive")
    if timeout <= 0:
        raise ValueError("timeout must be positive")

    actual_probe = probe if probe is not None else ActivityProbe()
    semaphore = asyncio.Semaphore(concurrency)
    tasks: list[asyncio.Task[JobResult]] = []

    # timeout 覆盖整个任务组；超时或子任务失败时 TaskGroup 会取消其余子任务并等待清理。
    async with asyncio.timeout(timeout):
        async with asyncio.TaskGroup() as group:
            tasks = [
                group.create_task(
                    _bounded_fetch(job, semaphore, actual_probe),
                    name=f"job:{job.id}",
                )
                for job in jobs
            ]

    # 离开 TaskGroup 时所有任务都已完成，result() 在这里不会阻塞 event loop。
    return tuple(task.result() for task in tasks)
