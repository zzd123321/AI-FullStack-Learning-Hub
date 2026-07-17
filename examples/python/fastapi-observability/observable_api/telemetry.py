import json
import logging
import re
from contextvars import ContextVar
from dataclasses import dataclass
from io import TextIOBase

from opentelemetry import trace
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
SENSITIVE_KEYS = {"authorization", "cookie", "password", "token", "secret"}


def redact(value: object) -> object:
    # 在结构进入 formatter 前递归脱敏，避免秘密被序列化进日志行。
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if str(key).casefold() in SENSITIVE_KEYS else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # ContextVar 让当前异步请求的 ID 跟随 Task 上下文，而不是使用全局变量。
        span_context = trace.get_current_span().get_span_context()
        payload = {
            "level": record.levelname,
            "message": record.getMessage(),
            "request_id": request_id_context.get(),
            "trace_id": f"{span_context.trace_id:032x}" if span_context.is_valid else None,
            "fields": redact(getattr(record, "fields", {})),
        }
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def build_logger(stream: TextIOBase) -> logging.Logger:
    logger = logging.getLogger(f"observable_api.{id(stream)}")
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    return logger


@dataclass(slots=True)
class Metrics:
    registry: CollectorRegistry
    requests: Counter
    duration: Histogram
    in_progress: Gauge


def build_metrics() -> Metrics:
    registry = CollectorRegistry()
    return Metrics(
        registry=registry,
        requests=Counter(
            "http_server_requests_total",
            "Completed HTTP requests",
            # route 使用模板而不是原始 URL，避免 task_id 等无限增加 label 基数。
            ["method", "route", "status"],
            registry=registry,
        ),
        duration=Histogram(
            "http_server_request_duration_seconds",
            "HTTP request duration",
            ["method", "route"],
            registry=registry,
        ),
        in_progress=Gauge(
            "http_server_requests_in_progress",
            "Currently executing HTTP requests",
            registry=registry,
        ),
    )
