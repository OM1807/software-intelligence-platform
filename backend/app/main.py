import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.database import Base, engine
from app.models import schema  # noqa: F401  (registers tables)


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


# Routers get added here once the endpoints are built:
from app.api.endpoints import auth  # noqa: E402

app.include_router(auth.router, prefix="/auth", tags=["auth"])

