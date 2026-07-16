from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


@dataclass(slots=True)
class UserRecord:
    id: UUID
    username: str
    password_hash: str
    roles: set[str] = field(default_factory=lambda: {"member"})
    disabled: bool = False
    token_version: int = 1


@dataclass(slots=True)
class DocumentRecord:
    id: int
    owner_id: UUID
    title: str


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=12, max_length=128)


class UserResponse(BaseModel):
    id: UUID
    username: str
    roles: list[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenClaims(BaseModel):
    sub: str
    iss: str
    aud: str | list[str]
    exp: datetime
    iat: datetime
    jti: str
    ver: int


class DocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)


class DocumentResponse(BaseModel):
    id: int
    owner_id: UUID
    title: str


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
