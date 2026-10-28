from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )

    ENVIRONMENT: str = "development"
    AUTO_CREATE_SCHEMA: bool = True

    DATABASE_URL: str = "postgresql://sip_user:sip_password@db:5432/sip_database"

    SECRET_KEY: str = "change-me-in-env"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"

    LLM_API_KEY: str = ""
    REPOS_DIR: str = "/tmp/sip_repos"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    def validate(self) -> "Settings":
        if self.is_production and self.SECRET_KEY in {"change-me", "change-me-in-env"}:
            raise ValueError("SECRET_KEY must be set to a non-default value in production.")
        if not self.FRONTEND_URL.startswith(("http://", "https://")):
            raise ValueError("FRONTEND_URL must start with http:// or https://")
        if not self.BACKEND_URL.startswith(("http://", "https://")):
            raise ValueError("BACKEND_URL must start with http:// or https://")
        return self


settings = Settings().validate()
