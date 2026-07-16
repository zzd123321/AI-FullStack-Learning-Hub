import pytest

from evolution_learning.evolution import (
    CohortRouter,
    FakeInventoryTransport,
    InventoryKernel,
    LegacyInventoryAdapter,
    LocalInventoryAdapter,
    MigratingInventoryAdapter,
    RemoteInventoryAdapter,
    ReservationCommand,
)


@pytest.mark.parametrize("kind", ["local", "remote"])
def test_local_and_remote_adapters_obey_the_same_contract(kind: str) -> None:
    kernel = InventoryKernel({"sku-1": 5})
    adapter = (
        LocalInventoryAdapter(kernel)
        if kind == "local"
        else RemoteInventoryAdapter(FakeInventoryTransport(kernel))
    )
    command = ReservationCommand("op-1", "sku-1", 2)

    first = adapter.reserve(command)
    replay = adapter.reserve(command)

    assert first.accepted
    assert first.remaining == 3
    assert replay == first
    assert kernel.effects == 1


def test_anti_corruption_layer_translates_legacy_language() -> None:
    adapter = LegacyInventoryAdapter(
        {"sku-1": {"itemCode": "sku-1", "unitsAvailable": 7}}
    )
    result = adapter.availability("sku-1")
    assert result.sku == "sku-1"
    assert result.available == 7


def test_cohort_routing_is_stable_for_the_same_subject() -> None:
    router = CohortRouter(50)
    decisions = {router.use_remote("tenant-a") for _ in range(20)}
    assert len(decisions) == 1
    assert not CohortRouter(0).use_remote("tenant-a")
    assert CohortRouter(100).use_remote("tenant-a")


def test_shadow_read_reports_difference_but_returns_primary_result() -> None:
    local = LocalInventoryAdapter(InventoryKernel({"sku-1": 5}))
    remote = RemoteInventoryAdapter(FakeInventoryTransport(InventoryKernel({"sku-1": 4})))
    migrating = MigratingInventoryAdapter(local, remote, CohortRouter(0))

    result = migrating.availability("sku-1", subject="tenant-a", shadow=True)

    assert result.available == 5
    assert len(migrating.shadow_mismatches) == 1


def test_remote_write_failure_does_not_fall_back_to_local_write() -> None:
    local_kernel = InventoryKernel({"sku-1": 5})
    remote_transport = FakeInventoryTransport(
        InventoryKernel({"sku-1": 5}), unavailable=True
    )
    migrating = MigratingInventoryAdapter(
        LocalInventoryAdapter(local_kernel),
        RemoteInventoryAdapter(remote_transport),
        CohortRouter(100),
    )

    with pytest.raises(ConnectionError):
        migrating.reserve(
            ReservationCommand("op-1", "sku-1", 2), subject="tenant-a"
        )
    assert local_kernel.effects == 0


def test_zero_and_full_rollout_select_expected_adapter() -> None:
    local_transport = InventoryKernel({"sku-1": 5})
    remote_transport = FakeInventoryTransport(InventoryKernel({"sku-1": 9}))
    local = LocalInventoryAdapter(local_transport)
    remote = RemoteInventoryAdapter(remote_transport)

    local_only = MigratingInventoryAdapter(local, remote, CohortRouter(0))
    remote_only = MigratingInventoryAdapter(local, remote, CohortRouter(100))

    assert local_only.availability("sku-1", subject="t").available == 5
    assert remote_only.availability("sku-1", subject="t").available == 9
