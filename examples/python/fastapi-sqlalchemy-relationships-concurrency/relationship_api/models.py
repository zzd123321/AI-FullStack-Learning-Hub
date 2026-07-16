from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)
    priority: int = Field(default=3, ge=1, le=5, strict=True)


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=120)
    priority: int | None = Field(default=None, ge=1, le=5, strict=True)
    completed: bool | None = None

    @field_validator("title", "priority", "completed")
    @classmethod
    def explicit_null_is_not_an_update(cls, value: object) -> object:
        if value is None:
            raise ValueError("explicit null is not allowed")
        return value

    @model_validator(mode="after")
    def at_least_one_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        return self


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    title: str
    priority: int
    completed: bool
    version: int


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class ProjectDetail(ProjectResponse):
    tasks: list[TaskResponse]


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
