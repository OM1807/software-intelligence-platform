import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.core import database as database_module
from app.core.config import settings

from app.models import schema  # noqa: F401  (registers tables)
from app.models.schema import Repository


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_CREATE_SCHEMA and settings.ENVIRONMENT.lower() == "development":
        for attempt in range(15):
            try:
                database_module.Base.metadata.create_all(bind=database_module.engine)
                break
            except OperationalError:
                if attempt == 14:
                    raise
                time.sleep(2)
    else:
        # Production/deployment expects migrations to manage schema evolution.
        pass
    with database_module.SessionLocal() as db:
        db.query(Repository).filter_by(status="processing").update(
            {"status": "failed", "error": "Interrupted by server restart. Please import again."})
        db.commit()
    yield


app = FastAPI(title="Software Intelligence Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


from app.api.endpoints import analysis, auth, dashboard, repositories  # noqa: E402

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(repositories.router, prefix="/repositories", tags=["repositories"])
app.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
