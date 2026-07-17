from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Availability:
    sku: str
    available: int


@dataclass(frozen=True)
class ReservationCommand:
    operation_id: str
    sku: str
    quantity: int


@dataclass(frozen=True)
class ReservationResult:
    operation_id: str
    accepted: bool
    remaining: int


class InventoryPort(Protocol):
    def availability(self, sku: str) -> Availability: ...

    def reserve(self, command: ReservationCommand) -> ReservationResult: ...


class InventoryKernel:
    """The domain implementation can live locally or behind a transport adapter."""

    def __init__(self, stock: dict[str, int]) -> None:
        self._stock = dict(stock)
        self._results: dict[str, ReservationResult] = {}
        self.effects = 0

    def availability(self, sku: str) -> Availability:
        return Availability(sku, self._stock.get(sku, 0))

    def reserve(self, command: ReservationCommand) -> ReservationResult:
        if command.operation_id in self._results:
            return self._results[command.operation_id]
        current = self._stock.get(command.sku, 0)
        accepted = command.quantity > 0 and current >= command.quantity
        remaining = current - command.quantity if accepted else current
        if accepted:
            self._stock[command.sku] = remaining
            self.effects += 1
        result = ReservationResult(command.operation_id, accepted, remaining)
        self._results[command.operation_id] = result
        return result


class LocalInventoryAdapter:
    def __init__(self, kernel: InventoryKernel) -> None:
        self._kernel = kernel

    def availability(self, sku: str) -> Availability:
        return self._kernel.availability(sku)

    def reserve(self, command: ReservationCommand) -> ReservationResult:
        return self._kernel.reserve(command)


class FakeInventoryTransport:
    """A transport boundary with JSON-like data and injectable failures."""

    def __init__(self, kernel: InventoryKernel, *, unavailable: bool = False) -> None:
        self._kernel = kernel
        self.unavailable = unavailable
        self.calls = 0

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        self.calls += 1
        if self.unavailable:
            raise ConnectionError("remote inventory is unavailable")
        sku = path.rsplit("/", 1)[-1]
        if method == "GET":
            result = self._kernel.availability(sku)
            return {"sku": result.sku, "available": result.available}
        if method == "POST" and body is not None:
            result = self._kernel.reserve(
                ReservationCommand(body["operation_id"], sku, body["quantity"])
            )
            return {
                "operation_id": result.operation_id,
                "accepted": result.accepted,
                "remaining": result.remaining,
            }
        raise ValueError("unsupported transport request")


class RemoteInventoryAdapter:
    def __init__(self, transport: FakeInventoryTransport) -> None:
        self._transport = transport

    def availability(self, sku: str) -> Availability:
        payload = self._transport.request("GET", f"/inventory/{sku}")
        return Availability(payload["sku"], payload["available"])

    def reserve(self, command: ReservationCommand) -> ReservationResult:
        payload = self._transport.request(
            "POST",
            f"/inventory/{command.sku}",
            {"operation_id": command.operation_id, "quantity": command.quantity},
        )
        return ReservationResult(
            payload["operation_id"], payload["accepted"], payload["remaining"]
        )


class LegacyInventoryAdapter:
    """An anti-corruption layer protects the new model from legacy field names."""

    def __init__(self, legacy_rows: dict[str, dict]) -> None:
        self._legacy_rows = legacy_rows

    def availability(self, sku: str) -> Availability:
        row = self._legacy_rows.get(sku, {"itemCode": sku, "unitsAvailable": 0})
        return Availability(row["itemCode"], row["unitsAvailable"])


class CohortRouter:
    def __init__(self, remote_percent: int) -> None:
        if not 0 <= remote_percent <= 100:
            raise ValueError("remote_percent must be between 0 and 100")
        self.remote_percent = remote_percent

    def use_remote(self, stable_subject: str) -> bool:
        # 用稳定身份哈希分桶，同一用户不会在本地与远程实现之间来回跳动。
        digest = hashlib.sha256(stable_subject.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % 100
        return bucket < self.remote_percent


class MigratingInventoryAdapter:
    def __init__(
        self,
        local: InventoryPort,
        remote: InventoryPort,
        router: CohortRouter,
    ) -> None:
        self._local = local
        self._remote = remote
        self._router = router
        self.shadow_mismatches: list[tuple[Availability, Availability]] = []

    def availability(
        self, sku: str, *, subject: str, shadow: bool = False
    ) -> Availability:
        if shadow:
            # 影子读同时比较新旧实现，但仍返回旧实现结果，因此可先观察而不影响用户。
            primary = self._local.availability(sku)
            candidate = self._remote.availability(sku)
            if candidate != primary:
                self.shadow_mismatches.append((primary, candidate))
            return primary
        target = self._remote if self._router.use_remote(subject) else self._local
        return target.availability(sku)

    def reserve(
        self, command: ReservationCommand, *, subject: str
    ) -> ReservationResult:
        target = self._remote if self._router.use_remote(subject) else self._local
        # 远程写结果未知时绝不能回退再写本地：第一次可能已成功，回退会造成双写。
        return target.reserve(command)
