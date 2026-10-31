from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.schema import User

router = APIRouter()
bearer = HTTPBearer(auto_error=False)

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_USER = "https://api.github.com/user"


# ---------- helpers ----------
def create_jwt(payload: dict, minutes: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    data = {**payload, "exp": exp}
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def upsert_github_user(db: Session, gh: dict, token: str) -> User:
    user = db.query(User).filter(User.github_id == gh["id"]).first()
    if not user:
        user = User(github_id=gh["id"], username=gh.get("login", "github_user"), role="developer")
        db.add(user)
    user.username = gh.get("login", user.username)
    user.email = gh.get("email")
    user.avatar_url = gh.get("avatar_url")
    user.github_token = token
    db.commit()
    db.refresh(user)
    return user


def fetch_github_user(token: str) -> dict:
    r = httpx.get(
        GITHUB_API_USER,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        timeout=15,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid GitHub token")
    return r.json()


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Use as a dependency on any protected endpoint."""
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = int(decode_jwt(creds.credentials)["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------- schemas ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str | None = None
    avatar_url: str | None = None
    role: str = "developer"


class PATLogin(BaseModel):
    token: str


class RoleUpdate(BaseModel):
    role: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- routes ----------
@router.get("/github/login")
def github_login():
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID is not configured")
    state = create_jwt({"purpose": "oauth_state"}, minutes=10)
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": f"{settings.BACKEND_URL}/auth/github/callback",
        "scope": "repo read:user user:email",
        "state": state,
    }
    return RedirectResponse(f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}")


@router.get("/github/callback")
def github_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        if decode_jwt(state).get("purpose") != "oauth_state":
            raise JWTError()
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    r = httpx.post(
        GITHUB_TOKEN_URL,
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": f"{settings.BACKEND_URL}/auth/github/callback",
        },
        headers={"Accept": "application/json"},
        timeout=15,
    )
    gh_token = r.json().get("access_token")
    if not gh_token:
        raise HTTPException(status_code=400, detail="GitHub did not return an access token")

    user = upsert_github_user(db, fetch_github_user(gh_token), gh_token)
    jwt_token = create_jwt({"sub": str(user.id)}, settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return RedirectResponse(f"{settings.FRONTEND_URL}/login?token={jwt_token}")


@router.post("/pat", response_model=TokenOut)
def login_with_pat(body: PATLogin, db: Session = Depends(get_db)):
    """Alternative login: user pastes a GitHub Personal Access Token."""
    user = upsert_github_user(db, fetch_github_user(body.token), body.token)
    jwt_token = create_jwt({"sub": str(user.id)}, settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return TokenOut(access_token=jwt_token, user=UserOut.model_validate(user))


@router.post("/role", response_model=UserOut)
def update_role(body: RoleUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Allow switching roles between Developer, Software Architect, and Administrator."""
    valid_roles = {"developer", "architect", "administrator"}
    if body.role.lower() not in valid_roles:
        raise HTTPException(status_code=400, detail="Role must be developer, architect, or administrator")
    user.role = body.role.lower()
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
