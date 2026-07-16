import json
from io import StringIO

from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from observable_api.app import create_app
from observable_api.telemetry import request_id_context


def setup() -> tuple[TestClient, InMemorySpanExporter, StringIO]:
    exporter = InMemorySpanExporter()
    stream = StringIO()
    app = create_app(span_exporter=exporter, log_stream=stream)
    return TestClient(app), exporter, stream


def test_request_id_is_propagated_and_context_is_reset() -> None:
    client, _, _ = setup()
    response = client.get("/api/v1/work/7", headers={"X-Request-ID": "request-123"})
    assert response.headers["x-request-id"] == "request-123"
    assert request_id_context.get() is None


def test_invalid_request_id_is_replaced() -> None:
    client, _, _ = setup()
    response = client.get("/api/v1/work/7", headers={"X-Request-ID": "bad id"})
    assert response.headers["x-request-id"] != "bad id"
    assert len(response.headers["x-request-id"]) == 32


def test_json_log_correlates_trace_and_redacts_secret() -> None:
    client, _, stream = setup()
    response = client.get(
        "/api/v1/work/7",
        headers={"X-Request-ID": "request-123", "Authorization": "Bearer secret"},
    )
    record = json.loads(stream.getvalue().splitlines()[-1])
    assert response.status_code == 200
    assert record["request_id"] == "request-123"
    assert len(record["trace_id"]) == 32
    assert "secret" not in json.dumps(record)


def test_metrics_use_route_template_not_raw_ids() -> None:
    client, _, _ = setup()
    client.get("/api/v1/work/7")
    client.get("/api/v1/work/999")
    metrics = client.get("/metrics").text
    assert 'route="/api/v1/work/{item_id}"' in metrics
    assert 'route="/api/v1/work/999"' not in metrics
    assert 'http_server_requests_total{method="GET",route="/api/v1/work/{item_id}",status="200"} 2.0' in metrics


def test_traceparent_is_parent_of_server_span() -> None:
    client, exporter, _ = setup()
    trace_id = "0af7651916cd43dd8448eb211c80319c"
    client.get(
        "/api/v1/work/7",
        headers={"traceparent": f"00-{trace_id}-b7ad6b7169203331-01"},
    )
    spans = exporter.get_finished_spans()
    server = next(span for span in spans if span.name == "GET /api/v1/work/{item_id}")
    assert f"{server.context.trace_id:032x}" == trace_id
    assert server.parent.span_id == int("b7ad6b7169203331", 16)


def test_failure_is_counted_logged_and_traced() -> None:
    client, exporter, stream = setup()
    client = TestClient(client.app, raise_server_exceptions=False)
    response = client.get("/api/v1/fail", headers={"Authorization": "Bearer secret"})
    metrics = client.get("/metrics").text
    server = next(span for span in exporter.get_finished_spans() if span.name == "GET /api/v1/fail")
    assert response.status_code == 500
    assert 'route="/api/v1/fail",status="500"' in metrics
    assert server.status.status_code.name == "ERROR"
    assert "secret" not in stream.getvalue()
