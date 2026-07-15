"""Compose functions, closures, and a decorator into a deterministic report."""

from __future__ import annotations

import json

from .closures import make_multipliers, make_sequence
from .decorators import audited
from .pricing import calculate_total


def build_report() -> dict[str, object]:
    audit_events: list[dict[str, object]] = []

    @audited("price.calculated", audit_events.append)
    def discounted_total(price: int, quantity: int) -> int:
        """Calculate a total with a fixed ten-percent discount."""
        return calculate_total(price, quantity, discount_basis_points=1_000)

    next_order_id = make_sequence("order")
    multipliers = make_multipliers([2, 3, 4])

    return {
        "totals": [discounted_total(1_000, 2), discounted_total(500, 3)],
        "sequence": [next_order_id(), next_order_id(), next_order_id()],
        "multiplied": [function(10) for function in multipliers],
        "audit_events": audit_events,
        "decorated_name": discounted_total.__name__,
        "decorated_doc": discounted_total.__doc__,
    }


def main() -> int:
    print(json.dumps(build_report(), ensure_ascii=False, indent=2))
    return 0
