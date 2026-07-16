from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer

from .repositories import InMemoryUserRepository, RevokedTokenStore
from .security import InvalidCredentialsError, Principal, TokenService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def get_principal(
    request: Request, token: Annotated[str, Depends(oauth2_scheme)]
) -> Principal:
    tokens: TokenService = request.app.state.tokens
    users: InMemoryUserRepository = request.app.state.users
    revoked: RevokedTokenStore = request.app.state.revoked
    claims = tokens.decode(token)
    user = users.get(tokens.subject_user_id(claims))
    if (
        user is None
        or user.disabled
        or user.token_version != claims.ver
        or revoked.contains(claims.jti)
    ):
        raise InvalidCredentialsError
    return Principal(user=user, claims=claims)


PrincipalDep = Annotated[Principal, Depends(get_principal)]
