from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RELATIONSHIP_API_",
        env_file=".env",
        extra="ignore",
        frozen=True,
    )
    database_url: str = "sqlite:///./relationship.db"
    sql_echo: bool = False
