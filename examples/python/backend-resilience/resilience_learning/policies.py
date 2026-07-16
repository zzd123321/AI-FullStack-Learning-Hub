from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from threading import BoundedSemaphore, Lock
from typing import Callable


class ManualClock:
    def __init__(self) -> None:
        self.now = 0.0

    def sleep(self, seconds: float) -> None:
        self.now += seconds


class Outcome(str, Enum):
    SUCCESS = "SUCCESS"
    TRANSIENT_FAILURE = "TRANSIENT_FAILURE"
    PERMANENT_FAILURE = "PERMANENT_FAILURE"


@dataclass(frozen=True)
class AttemptResult:
    outcome: Outcome
    duration: float
    value: str | None = None


class CallFailed(Exception):
    pass


class DeadlineExceeded(CallFailed):
    pass


class PermanentFailure(CallFailed):
    pass


class RetryExhausted(CallFailed):
    pass


@dataclass(frozen=True)
class RetryTrace:
    value: str
    attempts: int
    slept: tuple[float, ...]


class RetryPolicy:
    def __init__(
        self,
        *,
        max_attempts: int,
        initial_backoff: float,
        multiplier: float = 2.0,
        max_backoff: float = 10.0,
        jitter: Callable[[float], float] = lambda delay: delay,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        self.max_attempts = max_attempts
        self.initial_backoff = initial_backoff
        self.multiplier = multiplier
        self.max_backoff = max_backoff
        self.jitter = jitter

    def execute(
        self,
        operation: Callable[[float], AttemptResult],
        *,
        clock: ManualClock,
        deadline: float,
    ) -> RetryTrace:
        sleeps: list[float] = []
        for attempt in range(1, self.max_attempts + 1):
            remaining = deadline - clock.now
            if remaining <= 0:
                raise DeadlineExceeded("no request budget remains")

            result = operation(remaining)
            clock.sleep(result.duration)
            if clock.now > deadline:
                raise DeadlineExceeded("attempt finished after the deadline")
            if result.outcome == Outcome.SUCCESS:
                return RetryTrace(result.value or "", attempt, tuple(sleeps))
            if result.outcome == Outcome.PERMANENT_FAILURE:
                raise PermanentFailure("operation is not retryable")
            if attempt == self.max_attempts:
                break

            base = min(
                self.initial_backoff * (self.multiplier ** (attempt - 1)),
                self.max_backoff,
            )
            delay = max(0.0, self.jitter(base))
            if clock.now + delay >= deadline:
                raise DeadlineExceeded("backoff would consume the remaining budget")
            sleeps.append(delay)
            clock.sleep(delay)
        raise RetryExhausted("all retry attempts failed")


class BreakerState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitOpen(CallFailed):
    pass


class CircuitBreaker:
    def __init__(self, *, failure_threshold: int, open_seconds: float) -> None:
        self.failure_threshold = failure_threshold
        self.open_seconds = open_seconds
        self.state = BreakerState.CLOSED
        self.failures = 0
        self.opened_at: float | None = None
        self._probe_in_flight = False

    def acquire_permission(self, now: float) -> None:
        if self.state == BreakerState.OPEN:
            if self.opened_at is not None and now - self.opened_at >= self.open_seconds:
                self.state = BreakerState.HALF_OPEN
            else:
                raise CircuitOpen("dependency circuit is open")
        if self.state == BreakerState.HALF_OPEN:
            if self._probe_in_flight:
                raise CircuitOpen("half-open probe is already running")
            self._probe_in_flight = True

    def record_success(self) -> None:
        self.state = BreakerState.CLOSED
        self.failures = 0
        self.opened_at = None
        self._probe_in_flight = False

    def record_failure(self, now: float) -> None:
        self._probe_in_flight = False
        self.failures += 1
        if self.state == BreakerState.HALF_OPEN or self.failures >= self.failure_threshold:
            self.state = BreakerState.OPEN
            self.opened_at = now


class BulkheadFull(CallFailed):
    pass


class Bulkhead:
    def __init__(self, capacity: int) -> None:
        self._slots = BoundedSemaphore(capacity)

    def acquire(self) -> None:
        if not self._slots.acquire(blocking=False):
            raise BulkheadFull("dependency concurrency budget is full")

    def release(self) -> None:
        self._slots.release()


class TokenBucket:
    def __init__(
        self, *, capacity: float, refill_per_second: float, now: float = 0.0
    ) -> None:
        self.capacity = capacity
        self.refill_per_second = refill_per_second
        self.tokens = capacity
        self.updated_at = now
        self._lock = Lock()

    def allow(self, now: float, cost: float = 1.0) -> bool:
        with self._lock:
            effective_now = max(now, self.updated_at)
            elapsed = effective_now - self.updated_at
            self.tokens = min(
                self.capacity, self.tokens + elapsed * self.refill_per_second
            )
            self.updated_at = effective_now
            if self.tokens < cost:
                return False
            self.tokens -= cost
            return True


def worst_case_attempts(attempts_per_layer: int, retrying_layers: int) -> int:
    if attempts_per_layer < 1 or retrying_layers < 1:
        raise ValueError("arguments must be positive")
    return attempts_per_layer**retrying_layers
