from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import ValidationError

from .config import Settings
from .models import TokenClaims, UserRecord


class InvalidCredentialsError(Exception):
    pass


class PasswordService:
    def __init__(self) -> None:
        self.hasher = PasswordHash.recommended()
        # 用户不存在时仍执行一次相近成本的哈希验证，减少用户名枚举的时间差线索。
        self.dummy_hash = self.hasher.hash("dummy-password-never-authenticates")

    def hash(self, password: str) -> str:
        return self.hasher.hash(password)

    def verify(self, password: str, stored_hash: str) -> bool:
        return self.hasher.verify(password, stored_hash)

    def verify_dummy(self, password: str) -> None:
        self.hasher.verify(password, self.dummy_hash)


class TokenService:
    algorithm = "HS256"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def create(self, user: UserRecord, expires_delta: timedelta | None = None) -> str:
        # 使用带时区 UTC 时间，避免服务器本地时区改变 token 的生效与过期判断。
        now = datetime.now(timezone.utc)
        expires = now + (expires_delta or timedelta(minutes=self.settings.access_token_minutes))
        payload = {
            "sub": f"user:{user.id}",
            "iss": self.settings.jwt_issuer,
            "aud": self.settings.jwt_audience,
            "iat": now,
            "exp": expires,
            "jti": str(uuid4()),
            "ver": user.token_version,
        }
        return jwt.encode(
            payload,
            self.settings.jwt_secret.get_secret_value(),
            algorithm=self.algorithm,
        )

    def decode(self, token: str) -> TokenClaims:
        try:
            # 固定允许的算法，并同时验证 issuer、audience、过期时间与必需 claims。
            payload = jwt.decode(
                token,
                self.settings.jwt_secret.get_secret_value(),
                algorithms=[self.algorithm],
                issuer=self.settings.jwt_issuer,
                audience=self.settings.jwt_audience,
                options={"require": ["sub", "iss", "aud", "iat", "exp", "jti", "ver"]},
            )
            return TokenClaims.model_validate(payload)
        except (InvalidTokenError, ValidationError) as error:
            # 对外统一成“凭据无效”，不泄露签名、过期或 claim 结构中的具体差异。
            raise InvalidCredentialsError from error

    @staticmethod
    def subject_user_id(claims: TokenClaims) -> UUID:
        # sub 是外部 token 数据；即使签名有效，也要验证本系统约定的 user:<uuid> 结构。
        prefix, separator, raw_id = claims.sub.partition(":")
        if prefix != "user" or separator != ":":
            raise InvalidCredentialsError
        try:
            return UUID(raw_id)
        except ValueError as error:
            raise InvalidCredentialsError from error


@dataclass(frozen=True, slots=True)
class Principal:
    user: UserRecord
    claims: TokenClaims
