import logging
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

# Consistent project-level SQLite database file
DEFAULT_LOCAL_DB_PATH = Path(__file__).resolve().parents[2] / "sip_local.db"


def init_engine():
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if "sqlite" in db_url:
        return create_engine(db_url, connect_args={"check_same_thread": False})

    try:
        eng = create_engine(db_url, pool_pre_ping=True)
        # Test connection immediately
        with eng.connect():
            pass
        return eng
    except Exception as exc:
        if settings.is_production:
            logger.error("Production database connection failed: %s", exc)
            raise
        logger.warning(
            "Primary database (%s) unavailable: %s. Using SQLite local fallback for development.",
            db_url.split("@")[-1] if "@" in db_url else db_url,
            exc,
        )
        return create_engine(f"sqlite:///{DEFAULT_LOCAL_DB_PATH.as_posix()}", connect_args={"check_same_thread": False})


engine = init_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def ensure_tables_exist():
    """Ensure all model tables are created when running in development/fallback mode."""
    from app.models import schema  # noqa: F401
    Base.metadata.create_all(bind=engine)


def get_db():
    ensure_tables_exist()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
