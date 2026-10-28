import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.core.config import settings

from app.core.database import Base, SessionLocal, engine
from app.models import schema  # noqa: F401  (registers tables)
from app.models.schema import Repository

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Postgres may still be starting even though the container is "up"
    for attempt in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError:
            if attempt == 14:
                raise
            time.sleep(2)
    # a restart kills running background jobs, so don't leave repos stuck in "processing"
    with SessionLocal() as db:
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
