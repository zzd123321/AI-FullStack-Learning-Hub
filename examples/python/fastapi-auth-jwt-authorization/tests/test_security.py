from datetime import timedelta

from fastapi.testclient import TestClient

from secure_api.app import create_app
from secure_api.config import Settings


def new_client() -> tuple[TestClient, object]:
    app = create_app(Settings(environment="test", jwt_secret="t" * 48))
    return TestClient(app), app


def register_and_login(client: TestClient, username: str) -> str:
    password = "correct horse battery staple"
    registered = client.post(
        "/api/v1/auth/register", json={"username": username, "password": password}
    )
    assert registered.status_code == 201
    response = client.post(
        "/api/v1/auth/token", data={"username": username, "password": password}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_registration_stores_argon2_hash_not_plaintext() -> None:
    client, app = new_client()
    token = register_and_login(client, "alice")
    user = app.state.users.find_by_username("alice")
    assert token
    assert user.password_hash.startswith("$argon2")
    assert "correct horse" not in user.password_hash


def test_invalid_login_is_generic_401_with_challenge() -> None:
    client, _ = new_client()
    response = client.post(
        "/api/v1/auth/token", data={"username": "missing", "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_token_claims_and_authenticated_endpoint() -> None:
    client, app = new_client()
    token = register_and_login(client, "alice")
    claims = app.state.tokens.decode(token)
    response = client.get("/api/v1/users/me", headers=bearer(token))
    assert claims.iss == "https://api.example.test"
    assert claims.aud == "learning-api"
    assert claims.sub.startswith("user:")
    assert response.status_code == 200
    assert response.json()["username"] == "alice"


def test_expired_and_wrong_audience_tokens_are_rejected() -> None:
    client, app = new_client()
    token = register_and_login(client, "alice")
    user = app.state.users.find_by_username("alice")
    expired = app.state.tokens.create(user, expires_delta=timedelta(seconds=-1))
    other_app = create_app(
        Settings(environment="test", jwt_secret="t" * 48, jwt_audience="other-api")
    )
    assert client.get("/api/v1/users/me", headers=bearer(expired)).status_code == 401
    with TestClient(other_app) as other:
        assert other.get("/api/v1/users/me", headers=bearer(token)).status_code == 401


def test_logout_revokes_current_jti() -> None:
    client, _ = new_client()
    token = register_and_login(client, "alice")
    assert client.post("/api/v1/auth/logout", headers=bearer(token)).status_code == 204
    assert client.get("/api/v1/users/me", headers=bearer(token)).status_code == 401


def test_owner_authorization_returns_403_for_other_user() -> None:
    client, _ = new_client()
    alice = register_and_login(client, "alice")
    bob = register_and_login(client, "bob")
    document = client.post(
        "/api/v1/documents", headers=bearer(alice), json={"title": "Alice only"}
    )
    assert document.status_code == 201
    assert client.get("/api/v1/documents/1", headers=bearer(alice)).status_code == 200
    forbidden = client.get("/api/v1/documents/1", headers=bearer(bob))
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "forbidden"


def test_disabled_user_and_token_version_are_checked_on_every_request() -> None:
    client, app = new_client()
    token = register_and_login(client, "alice")
    user = app.state.users.find_by_username("alice")
    user.token_version += 1
    assert client.get("/api/v1/users/me", headers=bearer(token)).status_code == 401
