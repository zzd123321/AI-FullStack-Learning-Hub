"""Process configuration loaded from explicit inputs and environment sources."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TASK_API_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    app_name: str = "Modular Task API"
    environment: Literal["development", "test", "production"] = "development"
    max_page_size: int = Field(default=50, ge=1, le=100)


@lru_cache
def load_settings() -> Settings:
    """Read and validate configuration once per Python process."""
    return Settings()
