from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RepoImport(BaseModel):
    url: str
    access_token: str | None = None  # optional PAT for private repos


class RepoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner: str
    name: str
    url: str
    is_private: bool
    status: str
    error: str | None = None
    last_analyzed: datetime | None = None