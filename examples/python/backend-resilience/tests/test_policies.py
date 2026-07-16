import pytest

from resilience_learning.policies import (
    AttemptResult,
    BreakerState,
    Bulkhead,
    BulkheadFull,
    CircuitBreaker,
    CircuitOpen,
    DeadlineExceeded,
    ManualClock,
    Outcome,
    PermanentFailure,
    RetryPolicy,
    TokenBucket,
    worst_case_attempts,
)


def scripted(results):
    remaining_budgets = []

    def operation(remaining):
        remaining_budgets.append(remaining)
        return results.pop(0)

    return operation, remaining_budgets


def test_transient_failure_retries_with_backoff_inside_one_deadline() -> None:
    clock = ManualClock()
    operation, budgets = scripted(
        [
            AttemptResult(Outcome.TRANSIENT_FAILURE, 0.1),
            AttemptResult(Outcome.SUCCESS, 0.1, "ok"),
        ]
    )
    policy = RetryPolicy(max_attempts=3, initial_backoff=0.2)

    trace = policy.execute(operation, clock=clock, deadline=1.0)

    assert trace.value == "ok"
    assert trace.attempts == 2
    assert trace.slept == (0.2,)
    assert budgets == pytest.approx([1.0, 0.7])


def test_retry_stops_when_backoff_would_exhaust_deadline() -> None:
    clock = ManualClock()
    operation, _ = scripted([AttemptResult(Outcome.TRANSIENT_FAILURE, 0.4)])
    policy = RetryPolicy(max_attempts=3, initial_backoff=0.2)

    with pytest.raises(DeadlineExceeded):
        policy.execute(operation, clock=clock, deadline=0.5)


def test_permanent_failure_is_not_retried() -> None:
    clock = ManualClock()
    operation, budgets = scripted([AttemptResult(Outcome.PERMANENT_FAILURE, 0.1)])
    policy = RetryPolicy(max_attempts=3, initial_backoff=0.1)

    with pytest.raises(PermanentFailure):
        policy.execute(operation, clock=clock, deadline=1.0)
    assert len(budgets) == 1


def test_three_layers_with_three_attempts_can_reach_27_leaf_calls() -> None:
    assert worst_case_attempts(attempts_per_layer=3, retrying_layers=3) == 27


def test_circuit_breaker_opens_then_allows_one_half_open_probe() -> None:
    breaker = CircuitBreaker(failure_threshold=2, open_seconds=5)
    breaker.acquire_permission(0)
    breaker.record_failure(0)
    breaker.acquire_permission(1)
    breaker.record_failure(1)

    assert breaker.state == BreakerState.OPEN
    with pytest.raises(CircuitOpen):
        breaker.acquire_permission(2)

    breaker.acquire_permission(6)
    assert breaker.state == BreakerState.HALF_OPEN
    with pytest.raises(CircuitOpen):
        breaker.acquire_permission(6)
    breaker.record_success()
    assert breaker.state == BreakerState.CLOSED


def test_bulkhead_rejects_when_dependency_concurrency_is_full() -> None:
    bulkhead = Bulkhead(capacity=1)
    bulkhead.acquire()
    with pytest.raises(BulkheadFull):
        bulkhead.acquire()
    bulkhead.release()
    bulkhead.acquire()
    bulkhead.release()


def test_token_bucket_allows_burst_then_refills_over_time() -> None:
    limiter = TokenBucket(capacity=2, refill_per_second=1)
    assert limiter.allow(0)
    assert limiter.allow(0)
    assert not limiter.allow(0)
    assert limiter.allow(1)
    assert not limiter.allow(1)
