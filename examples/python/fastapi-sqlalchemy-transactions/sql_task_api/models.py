"""HTTP request and response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .orm import TaskStatus


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    priority: int = Field(default=3, ge=1, le=5, strict=True)


class TaskBatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tasks: list[TaskCreate] = Field(min_length=1, max_length=10)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    priority: int
    status: TaskStatus
    created_at: datetime


class TaskPage(BaseModel):
    items: list[TaskResponse]
    total: int
    offset: int
    limit: int


class HealthResponse(BaseModel):
    status: str


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
