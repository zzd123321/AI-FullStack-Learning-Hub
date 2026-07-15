"""A public function whose signature makes its calling contract explicit."""

from __future__ import annotations


def calculate_total(
    unit_price_cents: int,
    quantity: int,
    /,
    *,
    discount_basis_points: int = 0,
) -> int:
    """Calculate an integer-cent total using positional and keyword boundaries."""
    for field, value in (
        ("unit_price_cents", unit_price_cents),
        ("quantity", quantity),
        ("discount_basis_points", discount_basis_points),
    ):
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(f"{field} must be an int")

    if unit_price_cents < 0:
        raise ValueError("unit_price_cents must not be negative")
    if quantity < 1:
        raise ValueError("quantity must be greater than zero")
    if not 0 <= discount_basis_points <= 10_000:
        raise ValueError("discount_basis_points must be between 0 and 10000")

    subtotal = unit_price_cents * quantity
    discount = subtotal * discount_basis_points // 10_000
    return subtotal - discount
