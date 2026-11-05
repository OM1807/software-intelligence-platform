import os
import tempfile
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_repos_dir() -> str:
    return os.path.join(tempfile.gettempdir(), "sip_repos")


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
    REPOS_DIR: str = _default_repos_dir()

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    def validate(self) -> "Settings":
        if self.FRONTEND_URL:
            url = self.FRONTEND_URL.strip().rstrip('/')
            if not url.startswith(("http://", "https://")):
                url = f"https://{url}"
            if "onrender.com" not in url and "localhost" not in url and not url.startswith("http://127.0.0.1"):
                url = f"{url}.onrender.com"
            self.FRONTEND_URL = url

        if self.BACKEND_URL:
            url = self.BACKEND_URL.strip().rstrip('/')
            if not url.startswith(("http://", "https://")):
                url = f"https://{url}"
            if "onrender.com" not in url and "localhost" not in url and not url.startswith("http://127.0.0.1"):
                url = f"{url}.onrender.com"
            self.BACKEND_URL = url

        if self.is_production and self.SECRET_KEY in {"change-me", "change-me-in-env"}:
            raise ValueError("SECRET_KEY must be set to a non-default value in production.")
        return self


settings = Settings().validate()
