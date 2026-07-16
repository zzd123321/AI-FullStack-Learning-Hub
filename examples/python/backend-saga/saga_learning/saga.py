from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from threading import Lock
from uuid import uuid4


class SagaStatus(str, Enum):
    NEW = "NEW"
    INVENTORY_RESERVED = "INVENTORY_RESERVED"
    PAYMENT_CAPTURED = "PAYMENT_CAPTURED"
    COMPLETED = "COMPLETED"
    COMPENSATING = "COMPENSATING"
    COMPENSATED = "COMPENSATED"
    MANUAL_INTERVENTION = "MANUAL_INTERVENTION"


@dataclass
class OrderSaga:
    saga_id: str
    order_id: str
    sku: str
    quantity: int
    amount: str
    status: SagaStatus = SagaStatus.NEW
    failure: str | None = None
    inventory_reserved: bool = False
    payment_captured: bool = False


class SagaStore:
    """A stand-in for durable workflow state, not process-local call stack state."""

    def __init__(self) -> None:
        self._sagas: dict[str, OrderSaga] = {}
        self._lock = Lock()

    def create(self, saga: OrderSaga) -> None:
        with self._lock:
            if saga.saga_id in self._sagas:
                raise ValueError("saga already exists")
            self._sagas[saga.saga_id] = saga

    def get(self, saga_id: str) -> OrderSaga:
        with self._lock:
            return self._sagas[saga_id]


class InventoryService:
    def __init__(self, available: int) -> None:
        self.available = available
        self._results: dict[str, bool] = {}
        self._reservations: dict[str, int] = {}
        self.reserve_effects = 0
        self.release_effects = 0

    def reserve(self, operation_id: str, quantity: int) -> bool:
        if operation_id in self._results:
            return self._results[operation_id]
        accepted = self.available >= quantity
        self._results[operation_id] = accepted
        if accepted:
            self.available -= quantity
            self._reservations[operation_id] = quantity
            self.reserve_effects += 1
        return accepted

    def release(self, operation_id: str, reserve_operation_id: str) -> bool:
        if operation_id in self._results:
            return self._results[operation_id]
        quantity = self._reservations.pop(reserve_operation_id, 0)
        self.available += quantity
        self._results[operation_id] = True
        if quantity:
            self.release_effects += 1
        return True


class PaymentService:
    def __init__(self, *, decline_capture: bool = False, fail_refund: bool = False) -> None:
        self.decline_capture = decline_capture
        self.fail_refund = fail_refund
        self._results: dict[str, bool] = {}
        self._captures: set[str] = set()
        self.capture_effects = 0
        self.refund_effects = 0

    def capture(self, operation_id: str, amount: str) -> bool:
        if operation_id in self._results:
            return self._results[operation_id]
        accepted = not self.decline_capture
        self._results[operation_id] = accepted
        if accepted:
            self._captures.add(operation_id)
            self.capture_effects += 1
        return accepted

    def refund(self, operation_id: str, capture_operation_id: str) -> bool:
        if operation_id in self._results:
            return self._results[operation_id]
        if self.fail_refund:
            return False
        captured = capture_operation_id in self._captures
        self._results[operation_id] = captured
        if captured:
            self.refund_effects += 1
        return captured


class ShippingService:
    def __init__(self, *, fail_create: bool = False) -> None:
        self.fail_create = fail_create
        self._results: dict[str, bool] = {}
        self.shipment_effects = 0

    def create(self, operation_id: str, order_id: str) -> bool:
        if operation_id in self._results:
            return self._results[operation_id]
        accepted = not self.fail_create
        self._results[operation_id] = accepted
        if accepted:
            self.shipment_effects += 1
        return accepted


class OrderSagaOrchestrator:
    def __init__(
        self,
        store: SagaStore,
        inventory: InventoryService,
        payment: PaymentService,
        shipping: ShippingService,
    ) -> None:
        self.store = store
        self.inventory = inventory
        self.payment = payment
        self.shipping = shipping

    def start(self, order_id: str, sku: str, quantity: int, amount: str) -> str:
        saga_id = str(uuid4())
        self.store.create(OrderSaga(saga_id, order_id, sku, quantity, amount))
        return saga_id

    @staticmethod
    def operation_id(saga: OrderSaga, step: str) -> str:
        return f"{saga.saga_id}:{step}"

    def run(self, saga_id: str, *, crash_after: str | None = None) -> OrderSaga:
        saga = self.store.get(saga_id)

        if saga.status == SagaStatus.NEW:
            accepted = self.inventory.reserve(
                self.operation_id(saga, "reserve"), saga.quantity
            )
            if crash_after == "reserve-before-state-save":
                raise RuntimeError("orchestrator crashed after reserve reply")
            if not accepted:
                saga.failure = "inventory unavailable"
                saga.status = SagaStatus.COMPENSATED
                return saga
            saga.inventory_reserved = True
            saga.status = SagaStatus.INVENTORY_RESERVED

        if saga.status == SagaStatus.INVENTORY_RESERVED:
            accepted = self.payment.capture(
                self.operation_id(saga, "capture"), saga.amount
            )
            if not accepted:
                saga.failure = "payment declined"
                saga.status = SagaStatus.COMPENSATING
            else:
                saga.payment_captured = True
                saga.status = SagaStatus.PAYMENT_CAPTURED

        if saga.status == SagaStatus.PAYMENT_CAPTURED:
            accepted = self.shipping.create(
                self.operation_id(saga, "shipment"), saga.order_id
            )
            if not accepted:
                saga.failure = "shipment creation failed"
                saga.status = SagaStatus.COMPENSATING
            else:
                saga.status = SagaStatus.COMPLETED

        if saga.status == SagaStatus.COMPENSATING:
            capture_id = self.operation_id(saga, "capture")
            if saga.payment_captured and not self.payment.refund(
                self.operation_id(saga, "refund"), capture_id
            ):
                saga.status = SagaStatus.MANUAL_INTERVENTION
                saga.failure = f"{saga.failure}; refund failed"
                return saga
            if saga.inventory_reserved:
                self.inventory.release(
                    self.operation_id(saga, "release"),
                    self.operation_id(saga, "reserve"),
                )
            saga.status = SagaStatus.COMPENSATED

        return saga
