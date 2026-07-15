"""Run the lazy pipeline and display deterministic container results."""

from __future__ import annotations

import json

from .pipeline import batched, iter_valid_events, summarize_events


def build_report() -> dict[str, object]:
    rows = [
        {"user_id": " u-2 ", "event_type": "LOGIN"},
        {"user_id": "u-1", "event_type": "view"},
        {"user_id": "u-2", "event_type": "view"},
        {"user_id": "u-3", "event_type": "logout"},
        {"user_id": "u-1", "event_type": "view"},
    ]

    normalized = iter_valid_events(rows)
    event_batches = list(batched(normalized, 2))
    flattened = (event for batch in event_batches for event in batch)
    summary = summarize_events(flattened)

    return {
        "first_two_rows": rows[:2],
        "batch_sizes": [len(batch) for batch in event_batches],
        "summary": summary,
        "event_types_in_first_seen_order": list(summary["counts"]),
    }


def main() -> int:
    print(json.dumps(build_report(), ensure_ascii=False, indent=2))
    return 0
