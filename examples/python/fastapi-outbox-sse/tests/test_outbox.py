from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from outbox_api.app import create_app
from outbox_api.storage import EventStore
from outbox_api.worker import FakeBroker, OutboxRelay


def test_idempotency_key_replays_same_response_without_duplicate(tmp_path: Path) -> None:
    app = create_app(tmp_path / "api.db")
    with TestClient(app) as client:
        first = client.post("/api/v1/jobs", headers={"Idempotency-Key": "request-123"}, json={"name": "index data"})
        second = client.post("/api/v1/jobs", headers={"Idempotency-Key": "request-123"}, json={"name": "index data"})
        conflict = client.post("/api/v1/jobs", headers={"Idempotency-Key": "request-123"}, json={"name": "different job"})
        assert first.json() == second.json()
        assert second.headers["idempotency-replayed"] == "true"
        assert conflict.status_code == 409
        assert app.state.store.count("jobs") == app.state.store.count("outbox") == 1


def test_business_row_and_outbox_rollback_together(tmp_path: Path) -> None:
    with EventStore(tmp_path / "rollback.db") as store:
        with pytest.raises(RuntimeError):
            store.create_job("request-123", "fail", fail_before_commit=True)
        assert store.count("jobs") == store.count("outbox") == 0


def test_relay_duplicate_delivery_is_made_safe_by_idempotent_consumer(tmp_path: Path) -> None:
    with EventStore(tmp_path / "relay.db") as store:
        store.create_job("request-123", "send", False)
        broker = FakeBroker()
        now = [1000.0]
        relay = OutboxRelay(store, broker, clock=lambda: now[0])
        with pytest.raises(RuntimeError):
            relay.publish_one(crash_after_publish=True)
        assert relay.publish_one() is False  # 尚未到下一次尝试时间
        now[0] += 1
        relay.publish_one()
        assert len(broker.deliveries) == 2
        event_id, payload = broker.deliveries[0]
        assert store.consume_once("notifications", event_id, payload) is True
        assert store.consume_once("notifications", event_id, payload) is False
        assert store.count("notifications") == 1


def test_sse_can_resume_after_last_event_id(tmp_path: Path) -> None:
    app = create_app(tmp_path / "sse.db")
    app.state.store.create_job("request-001", "first")
    app.state.store.create_job("request-002", "second")
    with TestClient(app) as client:
        response = client.get("/api/v1/events", headers={"Last-Event-ID": "1"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "id: 2" in response.text
    assert "first" not in response.text


def test_background_task_runs_but_is_only_process_local(tmp_path: Path) -> None:
    app = create_app(tmp_path / "background.db")
    with TestClient(app) as client:
        response = client.post("/api/v1/best-effort", json={"name": "cleanup"})
    assert response.status_code == 202
    assert app.state.best_effort == ["cleanup"]
