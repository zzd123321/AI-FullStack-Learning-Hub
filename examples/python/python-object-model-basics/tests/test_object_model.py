from __future__ import annotations

import json
import subprocess
import sys
import unittest

from object_model_basics.quote import build_quote


class ObjectModelTest(unittest.TestCase):
    def test_equal_lists_can_have_distinct_identity(self) -> None:
        first = [1, 2]
        second = [1, 2]
        self.assertEqual(first, second)
        self.assertIsNot(first, second)

    def test_assignment_aliases_mutable_object(self) -> None:
        first = ["a"]
        second = first
        second.append("b")
        self.assertEqual(first, ["a", "b"])

    def test_shallow_copy_keeps_nested_alias(self) -> None:
        first = [["a"]]
        second = first.copy()
        second[0].append("b")
        self.assertEqual(first, [["a", "b"]])

    def test_quote_takes_immutable_snapshot_of_labels(self) -> None:
        labels = [" new "]
        quote = build_quote(500, 3, labels)
        labels.append("later")
        self.assertEqual(quote["labels"], ("new",))
        self.assertEqual(quote["total_cents"], 1_500)

    def test_boolean_is_rejected_as_integer_input(self) -> None:
        with self.assertRaisesRegex(TypeError, "must be an int, not bool"):
            build_quote(True, 2)

    def test_falsey_default_with_or_can_destroy_valid_zero(self) -> None:
        supplied_value = 0
        self.assertEqual(supplied_value or 100, 100)
        self.assertEqual(100 if supplied_value is None else supplied_value, 0)

    def test_module_report_is_valid_json(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "object_model_basics"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0)
        report = json.loads(completed.stdout)
        self.assertTrue(report["same_list_identity"])
        self.assertEqual(report["negative_floor_division"], -3)


if __name__ == "__main__":
    unittest.main()
