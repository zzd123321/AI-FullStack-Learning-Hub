from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_SECRET = "development-only-secret-change-before-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AUTH_API_", env_file=".env", extra="ignore", frozen=True
    )
    environment: Literal["development", "test", "production"] = "development"
    jwt_secret: SecretStr = SecretStr(DEVELOPMENT_SECRET)
    jwt_issuer: str = "https://api.example.test"
    jwt_audience: str = "learning-api"
    access_token_minutes: int = Field(default=15, ge=1, le=60)

    @model_validator(mode="after")
    def production_must_replace_development_secret(self) -> "Settings":
        secret = self.jwt_secret.get_secret_value()
        if len(secret) < 32:
            raise ValueError("jwt_secret must contain at least 32 characters")
        if self.environment == "production" and secret == DEVELOPMENT_SECRET:
            raise ValueError("production must replace the development JWT secret")
        return self
