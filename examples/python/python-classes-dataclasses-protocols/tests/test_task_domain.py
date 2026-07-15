from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
import unittest

from task_domain.models import InvalidTaskError, Task, TaskId, TaskStatus
from task_domain.repository import InMemoryTaskRepository, TaskNotFoundError
from task_domain.service import TaskService


class FixedClock:
    def __init__(self, value: datetime) -> None:
        self.value = value

    def now(self) -> datetime:
        return self.value


class RecordingNotifier:
    def __init__(self) -> None:
        self.completed_tasks: list[Task] = []

    def task_completed(self, task: Task) -> None:
        self.completed_tasks.append(task)


class TaskModelTests(unittest.TestCase):
    def test_value_objects_normalize_and_compare_by_value(self) -> None:
        self.assertEqual(TaskId.parse(" task-1 "), TaskId("task-1"))
        self.assertEqual(str(TaskId("task-1")), "task-1")

    def test_task_enforces_invariants_and_normalizes_values(self) -> None:
        task = Task(TaskId("1"), "  Learn protocols  ", priority=3, tags=(" python ", ""))

        self.assertEqual(task.title, "Learn protocols")
        self.assertEqual(task.tags, ("python",))
        with self.assertRaises(InvalidTaskError):
            Task(TaskId("2"), "invalid", priority=9)

    def test_frozen_task_transition_returns_a_new_valid_object(self) -> None:
        now = datetime(2026, 7, 15, 9, 0, tzinfo=UTC)
        pending = Task(TaskId("1"), "Learn classes")

        completed = pending.complete(at=now)

        self.assertIsNot(completed, pending)
        self.assertFalse(pending.is_completed)
        self.assertEqual(completed.status, TaskStatus.COMPLETED)
        self.assertEqual(completed.completed_at, now)
        with self.assertRaises(FrozenInstanceError):
            pending.title = "mutation is blocked"  # type: ignore[misc]

    def test_bound_method_keeps_its_instance(self) -> None:
        task = Task(TaskId("1"), "Learn binding")
        transition = task.complete

        self.assertIs(transition.__self__, task)
        self.assertTrue(transition(at=datetime.now(UTC)).is_completed)


class TaskServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 7, 15, 9, 0, tzinfo=UTC)
        self.repository = InMemoryTaskRepository()
        self.notifier = RecordingNotifier()
        self.service = TaskService(self.repository, self.notifier, FixedClock(self.now))

    def test_service_accepts_structural_protocol_implementations(self) -> None:
        task = Task(TaskId("task-1"), "Build backend model")
        self.repository.save(task)

        completed = self.service.complete(task.id)

        self.assertEqual(self.repository.get(task.id), completed)
        self.assertEqual(self.notifier.completed_tasks, [completed])

    def test_completing_twice_is_idempotent_and_notifies_once(self) -> None:
        task = Task(TaskId("task-1"), "Build backend model")
        self.repository.save(task)

        first = self.service.complete(task.id)
        second = self.service.complete(task.id)

        self.assertIs(second, first)
        self.assertEqual(self.notifier.completed_tasks, [first])

    def test_repository_translates_missing_key(self) -> None:
        with self.assertRaises(TaskNotFoundError) as captured:
            self.repository.get(TaskId("missing"))

        self.assertIsInstance(captured.exception.__cause__, KeyError)


if __name__ == "__main__":
    unittest.main()
