import pytest

from event_learning.model import (
    Event,
    FulfillmentProjection,
    InMemoryBroker,
    OrderDatabase,
    OutboxRelay,
    consume_one,
)


def configured_system():
    database = OrderDatabase()
    broker = InMemoryBroker(max_attempts=2)
    broker.subscribe("orders", "fulfillment")
    return database, broker, OutboxRelay(database, broker)


def test_order_and_outbox_event_are_created_together() -> None:
    database, _, _ = configured_system()
    event = database.create_order("o-100", "c-1", "59.90")

    assert database.has_order("o-100")
    assert database.pending_outbox()[0].event.event_id == event.event_id

    with pytest.raises(ValueError):
        database.create_order("o-100", "c-1", "59.90")
    assert len(database.pending_outbox()) == 1


def test_each_consumer_group_receives_its_own_copy() -> None:
    database, broker, relay = configured_system()
    broker.subscribe("orders", "analytics")
    event = database.create_order("o-100", "c-1", "59.90")
    relay.publish_pending()

    fulfillment = broker.receive("orders", "fulfillment")
    analytics = broker.receive("orders", "analytics")

    assert fulfillment.event.event_id == event.event_id
    assert analytics.event.event_id == event.event_id


def test_relay_crash_can_publish_duplicate_with_same_event_id() -> None:
    database, broker, relay = configured_system()
    event = database.create_order("o-100", "c-1", "59.90")

    with pytest.raises(RuntimeError):
        relay.publish_pending(crash_after_publish=True)
    relay.publish_pending()

    first = broker.receive("orders", "fulfillment")
    second = broker.receive("orders", "fulfillment")
    assert first.event.event_id == event.event_id == second.event.event_id


def test_idempotent_consumer_applies_duplicate_only_once() -> None:
    database, broker, relay = configured_system()
    database.create_order("o-100", "c-1", "59.90")
    with pytest.raises(RuntimeError):
        relay.publish_pending(crash_after_publish=True)
    relay.publish_pending()
    projection = FulfillmentProjection()

    assert consume_one(broker, projection)
    assert consume_one(broker, projection)
    assert projection.shipments == ["o-100"]


def test_failure_before_commit_is_requeued_and_then_succeeds() -> None:
    database, broker, relay = configured_system()
    database.create_order("o-100", "c-1", "59.90")
    relay.publish_pending()
    projection = FulfillmentProjection()

    assert not consume_one(broker, projection, fail_before_commit=True)
    assert projection.shipments == []
    assert consume_one(broker, projection)
    assert projection.shipments == ["o-100"]


def test_repeated_failure_reaches_dead_letter_storage() -> None:
    database, broker, relay = configured_system()
    database.create_order("o-100", "c-1", "59.90")
    relay.publish_pending()
    projection = FulfillmentProjection()

    assert not consume_one(broker, projection, fail_before_commit=True)
    assert not consume_one(broker, projection, fail_before_commit=True)
    dead = broker.dead_letters("orders", "fulfillment")
    assert len(dead) == 1
    assert dead[0].attempts == 2


def test_permanent_schema_failure_is_dead_lettered_without_hot_retry() -> None:
    _, broker, _ = configured_system()
    broker.publish(
        "orders",
        Event("e-1", "unknown.v1", "/test", "orders/o-1", "now", {}),
    )

    assert not consume_one(broker, FulfillmentProjection())
    dead = broker.dead_letters("orders", "fulfillment")
    assert len(dead) == 1
    assert dead[0].attempts == 1
