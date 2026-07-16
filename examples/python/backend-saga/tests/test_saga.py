import pytest

from saga_learning.saga import (
    InventoryService,
    OrderSagaOrchestrator,
    PaymentService,
    SagaStatus,
    SagaStore,
    ShippingService,
)


def system(*, stock=5, decline=False, shipping_failure=False, refund_failure=False):
    inventory = InventoryService(stock)
    payment = PaymentService(decline_capture=decline, fail_refund=refund_failure)
    shipping = ShippingService(fail_create=shipping_failure)
    orchestrator = OrderSagaOrchestrator(SagaStore(), inventory, payment, shipping)
    return orchestrator, inventory, payment, shipping


def test_successful_saga_commits_each_local_effect() -> None:
    orchestrator, inventory, payment, shipping = system()
    saga_id = orchestrator.start("o-100", "sku-1", 2, "59.90")

    saga = orchestrator.run(saga_id)

    assert saga.status == SagaStatus.COMPLETED
    assert inventory.available == 3
    assert payment.capture_effects == 1
    assert shipping.shipment_effects == 1


def test_inventory_rejection_needs_no_compensation() -> None:
    orchestrator, inventory, payment, _ = system(stock=1)
    saga_id = orchestrator.start("o-100", "sku-1", 2, "59.90")

    saga = orchestrator.run(saga_id)

    assert saga.status == SagaStatus.COMPENSATED
    assert inventory.available == 1
    assert payment.capture_effects == 0


def test_payment_decline_compensates_inventory_reservation() -> None:
    orchestrator, inventory, payment, _ = system(decline=True)
    saga_id = orchestrator.start("o-100", "sku-1", 2, "59.90")

    saga = orchestrator.run(saga_id)

    assert saga.status == SagaStatus.COMPENSATED
    assert inventory.available == 5
    assert inventory.release_effects == 1
    assert payment.refund_effects == 0


def test_shipping_failure_refunds_then_releases_inventory() -> None:
    orchestrator, inventory, payment, _ = system(shipping_failure=True)
    saga_id = orchestrator.start("o-100", "sku-1", 2, "59.90")

    saga = orchestrator.run(saga_id)

    assert saga.status == SagaStatus.COMPENSATED
    assert payment.refund_effects == 1
    assert inventory.available == 5


def test_crash_after_remote_success_reuses_same_idempotency_key_on_resume() -> None:
    orchestrator, inventory, payment, shipping = system()
    saga_id = orchestrator.start("o-100", "sku-1", 2, "59.90")

    with pytest.raises(RuntimeError):
        orchestrator.run(saga_id, crash_after="reserve-before-state-save")
    saga = orchestrator.run(saga_id)

    assert saga.status == SagaStatus.COMPLETED
    assert inventory.reserve_effects == 1
    assert payment.capture_effects == 1
    assert shipping.shipment_effects == 1


def test_failed_compensation_is_visible_for_manual_intervention() -> None:
    orchestrator, inventory, payment, _ = system(
        shipping_failure=True, refund_failure=True
    )
    saga_id = orchestrator.start("o-100", "sku-1", 2, "59.90")

    saga = orchestrator.run(saga_id)

    assert saga.status == SagaStatus.MANUAL_INTERVENTION
    assert inventory.available == 3
    assert payment.capture_effects == 1
    assert payment.refund_effects == 0
    assert "refund failed" in saga.failure
