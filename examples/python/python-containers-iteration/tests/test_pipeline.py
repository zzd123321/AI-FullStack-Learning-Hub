from __future__ import annotations

import unittest

from container_iteration.pipeline import batched, iter_valid_events, summarize_events


class PipelineTest(unittest.TestCase):
    def test_validation_is_lazy(self) -> None:
        rows = [
            {"user_id": "u-1", "event_type": "VIEW"},
            {"user_id": "", "event_type": "VIEW"},
        ]
        events = iter_valid_events(rows)
        self.assertEqual(next(events)["event_type"], "view")
        with self.assertRaisesRegex(ValueError, "row 2"):
            next(events)

    def test_generator_is_consumed_once(self) -> None:
        events = iter_valid_events([{"user_id": "u-1", "event_type": "view"}])
        self.assertEqual(len(list(events)), 1)
        self.assertEqual(list(events), [])

    def test_batched_accepts_generator_and_keeps_partial_tail(self) -> None:
        source = ({"user_id": str(index), "event_type": "view"} for index in range(5))
        batches = list(batched(source, 2))
        self.assertEqual([len(batch) for batch in batches], [2, 2, 1])
        self.assertTrue(all(isinstance(batch, tuple) for batch in batches))

    def test_batched_rejects_invalid_size(self) -> None:
        with self.assertRaisesRegex(ValueError, "greater than zero"):
            list(batched([], 0))
        with self.assertRaisesRegex(TypeError, "must be an int"):
            list(batched([], True))

    def test_summary_preserves_first_event_type_order(self) -> None:
        events = [
            {"user_id": "u-2", "event_type": "view"},
            {"user_id": "u-1", "event_type": "login"},
            {"user_id": "u-2", "event_type": "view"},
        ]
        summary = summarize_events(events)
        self.assertEqual(summary["counts"], {"view": 2, "login": 1})
        self.assertEqual(summary["unique_users"], ["u-1", "u-2"])

    def test_dict_keys_must_be_hashable(self) -> None:
        with self.assertRaises(TypeError):
            _ = {[]: "not allowed"}  # type: ignore[dict-item]

    def test_mutating_dict_size_during_iteration_fails(self) -> None:
        values = {"a": 1, "b": 2}
        with self.assertRaises(RuntimeError):
            for key in values:
                values[key + "-copy"] = values[key]


if __name__ == "__main__":
    unittest.main()
