"""Runtime validation at the untrusted object boundary."""

from __future__ import annotations

from collections.abc import Mapping
from typing import TypeGuard, cast

from .models import Task, TaskId, TaskStatus


class ValidationError(ValueError):
    """An external value cannot be converted into a valid Task."""


def is_string_list(value: object) -> TypeGuard[list[str]]:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _as_string_mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValidationError("task payload must be an object")
    if not all(isinstance(key, str) for key in value):
        raise ValidationError("task payload keys must be strings")
    return cast(Mapping[str, object], value)


def _required_string(payload: Mapping[str, object], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{field} must be a non-blank string")
    return value.strip()


def _task_status(value: object) -> TaskStatus:
    if value not in ("pending", "completed"):
        raise ValidationError("status must be 'pending' or 'completed'")
    return cast(TaskStatus, value)


def parse_task(value: object) -> Task:
    payload = _as_string_mapping(value)
    raw_priority = payload.get("priority")
    raw_tags = payload.get("tags", [])

    if not isinstance(raw_priority, int) or isinstance(raw_priority, bool):
        raise ValidationError("priority must be an integer")
    if not 1 <= raw_priority <= 5:
        raise ValidationError("priority must be between 1 and 5")
    if not is_string_list(raw_tags):
        raise ValidationError("tags must be a list of strings")

    return Task(
        id=TaskId(_required_string(payload, "id")),
        title=_required_string(payload, "title"),
        priority=raw_priority,
        status=_task_status(payload.get("status")),
        tags=tuple(tag.strip() for tag in raw_tags if tag.strip()),
    )
