import os
from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    environment: Literal["development", "test", "production"] = "development"
    release: str = Field(
        default="local", min_length=1, max_length=100, pattern=r"^[A-Za-z0-9._-]+$"
    )
    shutdown_drain_seconds: float = Field(default=10, ge=0.01, le=300)

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> "Settings":
        values = environ if environ is not None else os.environ
        return cls(
            environment=values.get("APP_ENV", "development"),
            release=values.get("APP_RELEASE", "local"),
            shutdown_drain_seconds=values.get("SHUTDOWN_DRAIN_SECONDS", "10"),
        )
