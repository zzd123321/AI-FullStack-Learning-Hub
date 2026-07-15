from __future__ import annotations

import unittest
from unittest.mock import create_autospec

from typed_tasks.models import Page, Task, TaskId
from typed_tasks.parsing import ValidationError, is_string_list, parse_task
from typed_tasks.query import paginate
from typed_tasks.service import TaskCatalog, TaskSource


VALID_TASK: dict[str, object] = {
    "id": "task-1",
    "title": "Learn typing",
    "priority": 3,
    "status": "pending",
    "tags": ["python", " backend "],
}


class ParsingTests(unittest.TestCase):
    def test_parse_task_validates_and_normalizes_untrusted_values(self) -> None:
        task = parse_task(VALID_TASK)

        self.assertEqual(task.id, TaskId("task-1"))
        self.assertEqual(task.tags, ("python", "backend"))

    def test_boolean_is_not_accepted_as_an_integer_priority(self) -> None:
        payload = {**VALID_TASK, "priority": True}

        with self.assertRaisesRegex(ValidationError, "priority must be an integer"):
            parse_task(payload)

    def test_invalid_boundaries_report_specific_errors(self) -> None:
        cases: tuple[tuple[object, str], ...] = (
            ([], "must be an object"),
            ({**VALID_TASK, "id": " "}, "id must be"),
            ({**VALID_TASK, "status": "deleted"}, "status must be"),
            ({**VALID_TASK, "tags": ["ok", 1]}, "tags must be"),
        )

        for payload, message in cases:
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(ValidationError, message):
                    parse_task(payload)

    def test_type_guard_has_real_runtime_predicate_behavior(self) -> None:
        self.assertTrue(is_string_list(["a", "b"]))
        self.assertFalse(is_string_list(["a", 1]))


class GenericPageTests(unittest.TestCase):
    def test_paginate_preserves_values_and_metadata(self) -> None:
        page = paginate([10, 20, 30], offset=1, limit=2)

        self.assertEqual(page, Page(items=(20, 30), total=3, offset=1, limit=2))

    def test_map_changes_item_type_without_changing_pagination(self) -> None:
        page = paginate([1, 2, 3], offset=0, limit=2)

        labels = page.map(lambda value: f"task-{value}")

        self.assertEqual(labels.items, ("task-1", "task-2"))
        self.assertEqual((labels.total, labels.offset, labels.limit), (3, 0, 2))

    def test_invalid_limit_fails_before_slicing(self) -> None:
        with self.assertRaisesRegex(ValueError, "limit must be positive"):
            paginate([1, 2], offset=0, limit=0)


class CatalogTests(unittest.TestCase):
    def test_fake_source_supports_state_focused_test(self) -> None:
        class FakeSource:
            def read(self) -> list[object]:
                return [VALID_TASK, {**VALID_TASK, "id": "task-2", "priority": 5}]

        catalog = TaskCatalog(FakeSource())

        page = catalog.page(offset=0, limit=10, predicate=lambda task: task.priority >= 5)

        self.assertEqual(tuple(task.id for task in page.items), (TaskId("task-2"),))
        self.assertEqual(page.total, 1)

    def test_autospec_mock_checks_interaction_with_source_contract(self) -> None:
        source = create_autospec(TaskSource, instance=True)
        source.read.return_value = [VALID_TASK]
        catalog = TaskCatalog(source)

        result = catalog.page(offset=0, limit=10)

        self.assertEqual(result.items[0].title, "Learn typing")
        source.read.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
