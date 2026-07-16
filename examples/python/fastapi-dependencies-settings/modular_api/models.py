"""HTTP transport models and their boundary validation rules."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TaskStatus = Literal["pending", "completed"]


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    priority: int = Field(default=3, ge=1, le=5, strict=True)
    tags: list[str] = Field(default_factory=list, max_length=10)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, tags: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(tag.strip().lower() for tag in tags if tag.strip()))
        if any(len(tag) > 30 for tag in normalized):
            raise ValueError("each tag must contain at most 30 characters")
        return normalized

    @model_validator(mode="after")
    def end_must_follow_start(self) -> Self:
        if self.starts_at is not None and self.ends_at is not None:
            if self.ends_at <= self.starts_at:
                raise ValueError("ends_at must be later than starts_at")
        return self


class TaskQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(default=None, min_length=1, max_length=80)
    status: TaskStatus | None = None
    min_priority: int | None = Field(default=None, ge=1, le=5)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    priority: int
    tags: list[str]
    status: TaskStatus
    starts_at: datetime | None
    ends_at: datetime | None


class TaskPage(BaseModel):
    items: list[TaskResponse]
    total: int
    offset: int
    limit: int


class HealthResponse(BaseModel):
    status: Literal["ready"]
    application: str
    environment: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, object]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
