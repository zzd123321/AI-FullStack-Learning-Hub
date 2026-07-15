from __future__ import annotations

import unittest

from function_patterns.closures import make_multipliers, make_sequence
from function_patterns.decorators import audited
from function_patterns.pricing import calculate_total


class FunctionPatternsTest(unittest.TestCase):
    def test_signature_enforces_positional_and_keyword_boundaries(self) -> None:
        self.assertEqual(calculate_total(1_000, 2, discount_basis_points=1_500), 1_700)
        with self.assertRaises(TypeError):
            calculate_total(unit_price_cents=1_000, quantity=2)  # type: ignore[call-arg]
        with self.assertRaises(TypeError):
            calculate_total(1_000, 2, 1_500)  # type: ignore[call-arg]

    def test_sequence_closure_keeps_independent_nonlocal_state(self) -> None:
        first = make_sequence("first")
        second = make_sequence("second")
        self.assertEqual([first(), first(), second(), first()], [
            "first-1", "first-2", "second-1", "first-3"
        ])

    def test_multiplier_factory_avoids_loop_late_binding(self) -> None:
        functions = make_multipliers([2, 3, 4])
        self.assertEqual([function(10) for function in functions], [20, 30, 40])

    def test_decorator_records_success_and_preserves_metadata(self) -> None:
        events: list[dict[str, object]] = []

        @audited("value.doubled", events.append)
        def double(value: int) -> int:
            """Double one integer."""
            return value * 2

        self.assertEqual(double(4), 8)
        self.assertEqual(events, [{"event": "value.doubled", "function": "double"}])
        self.assertEqual(double.__name__, "double")
        self.assertEqual(double.__doc__, "Double one integer.")

    def test_decorator_does_not_record_failed_call_as_success(self) -> None:
        events: list[dict[str, object]] = []

        @audited("operation.succeeded", events.append)
        def fail() -> None:
            raise RuntimeError("boom")

        with self.assertRaisesRegex(RuntimeError, "boom"):
            fail()
        self.assertEqual(events, [])

    def test_mutable_default_is_shared_because_definition_runs_once(self) -> None:
        def unsafe(value: int, collected: list[int] = []) -> list[int]:
            collected.append(value)
            return collected

        self.assertEqual(unsafe(1), [1])
        self.assertEqual(unsafe(2), [1, 2])


if __name__ == "__main__":
    unittest.main()
