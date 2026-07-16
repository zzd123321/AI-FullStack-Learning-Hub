from fastapi import Depends, FastAPI, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from typing import Annotated

from .config import Settings
from .dependencies import PrincipalDep
from .models import DocumentCreate, DocumentResponse, ErrorBody, ErrorResponse, RegisterRequest, TokenResponse, UserResponse
from .repositories import DuplicateUsernameError, InMemoryDocumentRepository, InMemoryUserRepository, RevokedTokenStore
from .security import InvalidCredentialsError, PasswordService, TokenService


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or Settings()
    app = FastAPI(title="Secure Learning API", version="5.0.0")
    app.state.users = InMemoryUserRepository()
    app.state.documents = InMemoryDocumentRepository()
    app.state.revoked = RevokedTokenStore()
    app.state.passwords = PasswordService()
    app.state.tokens = TokenService(resolved)

    def error(code: int, stable_code: str, message: str, authenticate: bool = False) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if authenticate else None
        body = ErrorResponse(error=ErrorBody(code=stable_code, message=message))
        return JSONResponse(status_code=code, content=body.model_dump(), headers=headers)

    @app.exception_handler(InvalidCredentialsError)
    async def invalid_credentials(_: Request, __: InvalidCredentialsError) -> JSONResponse:
        return error(401, "invalid_credentials", "Could not validate credentials", True)

    @app.exception_handler(DuplicateUsernameError)
    async def duplicate_username(_: Request, __: DuplicateUsernameError) -> JSONResponse:
        return error(409, "username_unavailable", "Username is unavailable")

    @app.post("/api/v1/auth/register", response_model=UserResponse, status_code=201)
    def register(payload: RegisterRequest) -> UserResponse:
        password_hash = app.state.passwords.hash(payload.password)
        user = app.state.users.create(payload.username, password_hash)
        return UserResponse(id=user.id, username=user.username, roles=sorted(user.roles))

    @app.post("/api/v1/auth/token", response_model=TokenResponse)
    def login(form: Annotated[OAuth2PasswordRequestForm, Depends()]) -> TokenResponse:
        user = app.state.users.find_by_username(form.username)
        if user is None:
            app.state.passwords.verify_dummy(form.password)
            raise InvalidCredentialsError
        if user.disabled or not app.state.passwords.verify(form.password, user.password_hash):
            raise InvalidCredentialsError
        token = app.state.tokens.create(user)
        return TokenResponse(
            access_token=token,
            expires_in=resolved.access_token_minutes * 60,
        )

    @app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(principal: PrincipalDep) -> None:
        app.state.revoked.revoke(principal.claims.jti, principal.claims.exp)

    @app.get("/api/v1/users/me", response_model=UserResponse)
    def me(principal: PrincipalDep) -> UserResponse:
        user = principal.user
        return UserResponse(id=user.id, username=user.username, roles=sorted(user.roles))

    @app.post("/api/v1/documents", response_model=DocumentResponse, status_code=201)
    def create_document(payload: DocumentCreate, principal: PrincipalDep) -> DocumentResponse:
        record = app.state.documents.create(principal.user.id, payload.title)
        return DocumentResponse(id=record.id, owner_id=record.owner_id, title=record.title)

    @app.get("/api/v1/documents/{document_id}", response_model=DocumentResponse)
    def get_document(document_id: int, principal: PrincipalDep) -> DocumentResponse:
        record = app.state.documents.get(document_id)
        if record is None:
            return error(404, "document_not_found", "Document was not found")
        if record.owner_id != principal.user.id and "admin" not in principal.user.roles:
            return error(403, "forbidden", "You cannot access this document")
        return DocumentResponse(id=record.id, owner_id=record.owner_id, title=record.title)

    return app


app = create_app()
