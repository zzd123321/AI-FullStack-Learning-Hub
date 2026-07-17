from __future__ import annotations

import math
from dataclasses import dataclass


def expected_concurrency(arrival_per_second: float, mean_service_seconds: float) -> float:
    if arrival_per_second < 0 or mean_service_seconds < 0:
        raise ValueError("rates and durations cannot be negative")
    # Little 定律的直觉：到达越快、每个请求停留越久，系统内同时存在的请求越多。
    return arrival_per_second * mean_service_seconds


def required_workers(
    arrival_per_second: float,
    mean_service_seconds: float,
    *,
    target_utilization: float,
) -> int:
    if not 0 < target_utilization < 1:
        raise ValueError("target_utilization must be between zero and one")
    concurrency = expected_concurrency(arrival_per_second, mean_service_seconds)
    return math.ceil(concurrency / target_utilization)


@dataclass(frozen=True)
class ErrorBudget:
    slo: float
    total_events: int
    bad_events: int

    def __post_init__(self) -> None:
        if not 0 < self.slo <= 1:
            raise ValueError("slo must be in (0, 1]")
        if not 0 <= self.bad_events <= self.total_events:
            raise ValueError("event counts are invalid")

    @property
    def allowed_bad(self) -> float:
        return self.total_events * (1 - self.slo)

    @property
    def remaining(self) -> float:
        # 可为负数；负数表示这个统计窗口已经透支错误预算。
        return self.allowed_bad - self.bad_events

    @property
    def burn_ratio(self) -> float:
        if self.allowed_bad == 0:
            return math.inf if self.bad_events else 0.0
        return self.bad_events / self.allowed_bad


def monthly_unavailability_minutes(slo: float, days: int = 30) -> float:
    if not 0 < slo <= 1 or days <= 0:
        raise ValueError("invalid SLO window")
    return days * 24 * 60 * (1 - slo)


def independent_series_availability(*components: float) -> float:
    _validate_availabilities(components)
    # 串联链路要求每个组件同时成功，因此端到端可用性是各项乘积。
    return math.prod(components)


def independent_parallel_availability(*replicas: float) -> float:
    _validate_availabilities(replicas)
    return 1 - math.prod(1 - value for value in replicas)


def _validate_availabilities(values: tuple[float, ...]) -> None:
    if not values or any(not 0 <= value <= 1 for value in values):
        raise ValueError("availability values must be between zero and one")


@dataclass(frozen=True)
class RecoveryPoint:
    point_id: str
    timestamp_minutes: int
    checksum_valid: bool
    restore_tested: bool


class RecoveryPointUnavailable(Exception):
    pass


@dataclass(frozen=True)
class RecoverySelection:
    point: RecoveryPoint
    data_loss_minutes: int
    meets_rpo: bool


class BackupCatalog:
    def __init__(self, points: list[RecoveryPoint]) -> None:
        self._points = list(points)

    def select(
        self, *, incident_timestamp_minutes: int, required_rpo_minutes: int
    ) -> RecoverySelection:
        if required_rpo_minutes < 0:
            raise ValueError("required RPO cannot be negative")
        candidates = [
            point
            for point in self._points
            if point.timestamp_minutes <= incident_timestamp_minutes
            and point.checksum_valid
            and point.restore_tested
        ]
        if not candidates:
            raise RecoveryPointUnavailable("no validated recovery point is available")
        # 不是选“最新文件”，而是选事故前、校验通过且实际演练恢复成功的最新恢复点。
        point = max(candidates, key=lambda item: item.timestamp_minutes)
        loss = incident_timestamp_minutes - point.timestamp_minutes
        return RecoverySelection(point, loss, loss <= required_rpo_minutes)


@dataclass(frozen=True)
class RecoveryRun:
    detect_minutes: int
    decide_minutes: int
    provision_minutes: int
    restore_minutes: int
    validate_minutes: int
    shift_traffic_minutes: int

    def __post_init__(self) -> None:
        if any(
            value < 0
            for value in (
                self.detect_minutes,
                self.decide_minutes,
                self.provision_minutes,
                self.restore_minutes,
                self.validate_minutes,
                self.shift_traffic_minutes,
            )
        ):
            raise ValueError("recovery stage durations cannot be negative")

    @property
    def total_minutes(self) -> int:
        # RTO 从故障发生后开始计算，不只是存储工具显示的 restore 阶段。
        return sum(
            (
                self.detect_minutes,
                self.decide_minutes,
                self.provision_minutes,
                self.restore_minutes,
                self.validate_minutes,
                self.shift_traffic_minutes,
            )
        )

    def meets_rto(self, required_rto_minutes: int) -> bool:
        return self.total_minutes <= required_rto_minutes
