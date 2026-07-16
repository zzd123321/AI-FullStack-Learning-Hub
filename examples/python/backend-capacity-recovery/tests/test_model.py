import pytest

from reliability_learning.model import (
    BackupCatalog,
    ErrorBudget,
    RecoveryPoint,
    RecoveryPointUnavailable,
    RecoveryRun,
    expected_concurrency,
    independent_parallel_availability,
    independent_series_availability,
    monthly_unavailability_minutes,
    required_workers,
)


def test_littles_law_and_headroom_turn_workload_into_worker_count() -> None:
    assert expected_concurrency(200, 0.1) == pytest.approx(20)
    assert required_workers(200, 0.1, target_utilization=0.5) == 40


def test_error_budget_measures_bad_events_against_slo_allowance() -> None:
    budget = ErrorBudget(slo=0.999, total_events=1_000_000, bad_events=500)
    assert budget.allowed_bad == pytest.approx(1000)
    assert budget.remaining == pytest.approx(500)
    assert budget.burn_ratio == pytest.approx(0.5)
    assert monthly_unavailability_minutes(0.999) == pytest.approx(43.2)


def test_serial_dependencies_reduce_end_to_end_availability() -> None:
    assert independent_series_availability(0.999, 0.999, 0.999) == pytest.approx(
        0.997002999
    )


def test_independent_replicas_improve_availability_only_under_independence() -> None:
    assert independent_parallel_availability(0.99, 0.99) == pytest.approx(0.9999)


def test_restore_selection_ignores_corrupt_and_unproven_backups() -> None:
    catalog = BackupCatalog(
        [
            RecoveryPoint("good", 90, True, True),
            RecoveryPoint("corrupt", 98, False, True),
            RecoveryPoint("untested", 99, True, False),
        ]
    )
    selection = catalog.select(incident_timestamp_minutes=100, required_rpo_minutes=15)
    assert selection.point.point_id == "good"
    assert selection.data_loss_minutes == 10
    assert selection.meets_rpo


def test_missing_validated_restore_point_is_explicit_failure() -> None:
    catalog = BackupCatalog([RecoveryPoint("untested", 99, True, False)])
    with pytest.raises(RecoveryPointUnavailable):
        catalog.select(incident_timestamp_minutes=100, required_rpo_minutes=15)


def test_rto_includes_detection_decision_validation_and_traffic_shift() -> None:
    run = RecoveryRun(5, 5, 10, 20, 10, 5)
    assert run.total_minutes == 55
    assert run.meets_rto(60)
    assert not run.meets_rto(45)
