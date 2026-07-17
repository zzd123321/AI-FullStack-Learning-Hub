"""A parameterized decorator that preserves wrapped-function metadata."""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")
AuditSink = Callable[[dict[str, object]], None]


def audited(event_name: str, sink: AuditSink) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Record successful calls while preserving the original callable signature type."""
    normalized_event = event_name.strip()
    if not normalized_event:
        raise ValueError("event_name must not be blank")

    def decorate(function: Callable[P, R]) -> Callable[P, R]:
        # wraps 保留原函数名称、文档和 __wrapped__，框架反射时不会只看到 wrapper。
        @wraps(function)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            # 先调用原函数；若它抛异常，成功审计记录不会错误地写入。
            result = function(*args, **kwargs)
            sink({"event": normalized_event, "function": function.__name__})
            return result

        # decorator 最终用 wrapper 替换原名称，但 ParamSpec/TypeVar 保留调用签名关系。
        return wrapper

    return decorate
