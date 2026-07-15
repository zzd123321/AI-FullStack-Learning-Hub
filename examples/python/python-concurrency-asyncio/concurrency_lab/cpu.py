"""CPU-bound work suitable for a process pool."""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from math import isqrt


def count_primes(limit: int) -> int:
    if limit < 0:
        raise ValueError("limit must not be negative")

    count = 0
    for candidate in range(2, limit + 1):
        upper = isqrt(candidate)
        if all(candidate % divisor for divisor in range(2, upper + 1)):
            count += 1
    return count


def run_in_processes(limits: list[int], *, max_workers: int) -> tuple[int, ...]:
    if max_workers <= 0:
        raise ValueError("max_workers must be positive")
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        return tuple(executor.map(count_primes, limits))
