import sys
import time
from io import TextIOBase
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import Response
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter
from opentelemetry.trace import SpanKind, Status, StatusCode
from prometheus_client import generate_latest

from .telemetry import REQUEST_ID_PATTERN, build_logger, build_metrics, request_id_context


def create_app(
    *, span_exporter: SpanExporter | None = None, log_stream: TextIOBase | None = None
) -> FastAPI:
    app = FastAPI(title="Observable Learning API")
    metrics = build_metrics()
    logger = build_logger(log_stream or sys.stdout)
    provider = TracerProvider(resource=Resource.create({"service.name": "observable-api"}))
    if span_exporter is not None:
        provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    tracer = provider.get_tracer("observable_api")
    app.state.metrics = metrics
    app.state.tracer_provider = provider

    @app.middleware("http")
    async def observe(request: Request, call_next):
        supplied = request.headers.get("X-Request-ID", "")
        request_id = supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else uuid4().hex
        context_token = request_id_context.set(request_id)
        started = time.perf_counter()
        status_code = 500
        metrics.in_progress.inc()
        parent_context = extract(dict(request.headers))
        try:
            with tracer.start_as_current_span(
                f"{request.method} request", context=parent_context, kind=SpanKind.SERVER
            ) as span:
                try:
                    response = await call_next(request)
                    status_code = response.status_code
                except Exception as error:
                    span.record_exception(error)
                    span.set_status(Status(StatusCode.ERROR))
                    logger.exception(
                        "request.failed",
                        extra={"fields": {"method": request.method, "authorization": request.headers.get("Authorization")}},
                    )
                    raise
                finally:
                    route = getattr(request.scope.get("route"), "path", "unmatched")
                    span.update_name(f"{request.method} {route}")
                    span.set_attribute("http.route", route)
                    span.set_attribute("http.response.status_code", status_code)
                response.headers["X-Request-ID"] = request_id
                logger.info(
                    "request.completed",
                    extra={"fields": {"method": request.method, "route": route, "status": status_code}},
                )
                return response
        finally:
            route = getattr(request.scope.get("route"), "path", "unmatched")
            elapsed = time.perf_counter() - started
            metrics.requests.labels(request.method, route, str(status_code)).inc()
            metrics.duration.labels(request.method, route).observe(elapsed)
            metrics.in_progress.dec()
            request_id_context.reset(context_token)

    @app.get("/api/v1/work/{item_id}")
    async def work(item_id: int) -> dict[str, int]:
        with tracer.start_as_current_span("work.calculate") as span:
            span.set_attribute("work.item_id", item_id)
            return {"result": item_id * 2}

    @app.get("/api/v1/fail")
    async def fail() -> None:
        raise RuntimeError("simulated failure")

    @app.get("/metrics", include_in_schema=False)
    async def prometheus_metrics() -> Response:
        return Response(generate_latest(metrics.registry), media_type="text/plain; version=0.0.4")

    return app


app = create_app()
