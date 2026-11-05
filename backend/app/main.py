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
    if settings.AUTO_CREATE_SCHEMA:
        for attempt in range(15):
            try:
                database_module.Base.metadata.create_all(bind=database_module.engine)
                break
            except Exception:
                if attempt == 14:
                    raise
                time.sleep(2)

    try:
        with database_module.SessionLocal() as db:
            db.query(Repository).filter_by(status="processing").update(
                {"status": "failed", "error": "Interrupted by server restart. Please import again."})
            db.commit()
    except Exception:
        # Safe if tables are not yet populated or on initial clean start
        pass

    yield


app = FastAPI(title="Software Intelligence Platform", lifespan=lifespan)

cors_origins = [settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"]
if not settings.FRONTEND_URL.startswith("http"):
    cors_origins.extend([f"https://{settings.FRONTEND_URL}", f"http://{settings.FRONTEND_URL}"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.onrender\.com",
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
