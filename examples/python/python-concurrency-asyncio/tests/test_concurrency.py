from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import unittest

from concurrency_lab.async_pipeline import ActivityProbe, run_async
from concurrency_lab.blocking import ThreadSafeMetrics, run_threaded
from concurrency_lab.cpu import count_primes, run_in_processes
from concurrency_lab.models import Job, JobError


class ThreadPoolTests(unittest.TestCase):
    def test_results_keep_input_order_even_when_completion_order_differs(self) -> None:
        jobs = [Job("slow", 0.03), Job("fast", 0.001), Job("middle", 0.01)]

        results = run_threaded(jobs, max_workers=3)

        self.assertEqual(tuple(result.job_id for result in results), ("slow", "fast", "middle"))
        self.assertTrue(all(result.worker.startswith("job") for result in results))

    def test_lock_protects_compound_metric_update(self) -> None:
        metrics = ThreadSafeMetrics()
        jobs = [Job(str(index), 0) for index in range(100)]

        run_threaded(jobs, max_workers=8, metrics=metrics)

        self.assertEqual(metrics.completed, 100)

    def test_future_result_re_raises_worker_exception(self) -> None:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(lambda: (_ for _ in ()).throw(JobError("broken")))

            with self.assertRaisesRegex(JobError, "broken"):
                future.result()


class ProcessPoolTests(unittest.TestCase):
    def test_cpu_function_has_deterministic_results(self) -> None:
        self.assertEqual(count_primes(10), 4)
        self.assertEqual(count_primes(30), 10)

    def test_process_pool_returns_results_in_input_order(self) -> None:
        self.assertEqual(run_in_processes([10, 30, 20], max_workers=2), (4, 10, 8))


class AsyncPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_semaphore_bounds_concurrency_and_preserves_result_order(self) -> None:
        probe = ActivityProbe()
        jobs = [Job(str(index), 0.005) for index in range(6)]

        results = await run_async(jobs, concurrency=2, timeout=1, probe=probe)

        self.assertEqual(tuple(result.job_id for result in results), tuple(str(i) for i in range(6)))
        self.assertEqual(probe.maximum_active, 2)
        self.assertEqual(probe.active, 0)
        self.assertCountEqual(probe.finished, [job.id for job in jobs])

    async def test_timeout_cancels_tasks_and_finally_releases_activity(self) -> None:
        probe = ActivityProbe()

        with self.assertRaises(TimeoutError):
            await run_async([Job("slow", 1)], concurrency=1, timeout=0.01, probe=probe)

        self.assertEqual(probe.active, 0)
        self.assertEqual(probe.cancelled, ["slow"])
        self.assertEqual(probe.finished, ["slow"])

    async def test_task_group_failure_cancels_sibling_and_raises_group(self) -> None:
        probe = ActivityProbe()
        jobs = [Job("failure", 0.001, fail=True), Job("sibling", 1)]

        with self.assertRaises(ExceptionGroup) as captured:
            await run_async(jobs, concurrency=2, timeout=2, probe=probe)

        matching, rest = captured.exception.split(JobError)
        self.assertIsNotNone(matching)
        self.assertIsNone(rest)
        self.assertIn("sibling", probe.cancelled)
        self.assertEqual(probe.active, 0)


if __name__ == "__main__":
    unittest.main()
