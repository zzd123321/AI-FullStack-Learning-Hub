"""Closures that retain state without introducing global variables."""

from __future__ import annotations

from collections.abc import Callable


def make_sequence(prefix: str) -> Callable[[], str]:
    """Return a function that closes over prefix and a nonlocal counter."""
    normalized_prefix = prefix.strip()
    if not normalized_prefix:
        raise ValueError("prefix must not be blank")

    current = 0

    def next_value() -> str:
        nonlocal current
        current += 1
        return f"{normalized_prefix}-{current}"

    return next_value


def make_multipliers(factors: list[int]) -> list[Callable[[int], int]]:
    """Bind each factor in a new factory call instead of late-binding one loop name."""
    def multiplier_for(factor: int) -> Callable[[int], int]:
        def multiply(value: int) -> int:
            return factor * value

        return multiply

    return [multiplier_for(factor) for factor in factors]
