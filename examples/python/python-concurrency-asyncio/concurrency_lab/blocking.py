"""Blocking jobs executed by a bounded thread pool."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from threading import Lock, current_thread
import time

from .models import Job, JobError, JobResult


class ThreadSafeMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._completed = 0

    def record_completed(self) -> None:
        with self._lock:
            self._completed += 1

    @property
    def completed(self) -> int:
        with self._lock:
            return self._completed


def fetch_blocking(job: Job, metrics: ThreadSafeMetrics) -> JobResult:
    time.sleep(job.delay)
    if job.fail:
        raise JobError(f"job failed: {job.id}")
    metrics.record_completed()
    return JobResult(job.id, current_thread().name)


def run_threaded(
    jobs: list[Job], *, max_workers: int, metrics: ThreadSafeMetrics | None = None
) -> tuple[JobResult, ...]:
    if max_workers <= 0:
        raise ValueError("max_workers must be positive")

    actual_metrics = metrics if metrics is not None else ThreadSafeMetrics()
    ordered: list[JobResult | None] = [None] * len(jobs)

    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="job") as executor:
        futures: dict[Future[JobResult], int] = {
            executor.submit(fetch_blocking, job, actual_metrics): index
            for index, job in enumerate(jobs)
        }
        try:
            for future in as_completed(futures):
                ordered[futures[future]] = future.result()
        except BaseException:
            for future in futures:
                future.cancel()
            raise

    return tuple(result for result in ordered if result is not None)
