"""A small pricing rule that makes type and mutability boundaries explicit."""

from __future__ import annotations


def build_quote(
    unit_price_cents: int,
    quantity: int,
    labels: list[str] | None = None,
) -> dict[str, int | tuple[str, ...]]:
    """Validate values and return a snapshot that does not alias the label list."""
    _require_positive_integer("unit_price_cents", unit_price_cents)
    _require_positive_integer("quantity", quantity)

    normalized_labels = tuple(
        label.strip()
        for label in (labels if labels is not None else [])
        if label.strip()
    )
    return {
        "unit_price_cents": unit_price_cents,
        "quantity": quantity,
        "total_cents": unit_price_cents * quantity,
        "labels": normalized_labels,
    }


def _require_positive_integer(field: str, value: object) -> None:
    # bool is a subclass of int, so isinstance(True, int) alone is insufficient.
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{field} must be an int, not {type(value).__name__}")
    if value <= 0:
        raise ValueError(f"{field} must be greater than zero")
