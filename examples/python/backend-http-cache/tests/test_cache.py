from fastapi.testclient import TestClient

from cache_api.app import create_app


def test_freshness_policy_distinguishes_private_and_shared_caches() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/catalog")

    assert response.status_code == 200
    assert response.headers["cache-control"] == (
        "public, max-age=10, s-maxage=60, "
        "stale-while-revalidate=30, stale-if-error=300"
    )
    assert response.headers["etag"].startswith('"')


def test_matching_etag_returns_bodyless_304_with_cache_metadata() -> None:
    with TestClient(create_app()) as client:
        first = client.get("/api/catalog")
        validated = client.get(
            "/api/catalog", headers={"If-None-Match": first.headers["etag"]}
        )

    assert validated.status_code == 304
    assert validated.content == b""
    assert validated.headers["etag"] == first.headers["etag"]
    assert "max-age=10" in validated.headers["cache-control"]


def test_changed_representation_gets_new_etag_and_200() -> None:
    with TestClient(create_app()) as client:
        first = client.get("/api/catalog")
        mutation = client.patch(
            "/api/catalog/products/p-100", json={"name": "Quiet Keyboard"}
        )
        refreshed = client.get(
            "/api/catalog", headers={"If-None-Match": first.headers["etag"]}
        )

    assert mutation.status_code == 200
    assert mutation.headers["cache-control"] == "no-store"
    assert refreshed.status_code == 200
    assert refreshed.headers["etag"] != first.headers["etag"]
    assert refreshed.json()["products"][0]["name"] == "Quiet Keyboard"


def test_vary_and_etag_keep_language_representations_separate() -> None:
    with TestClient(create_app()) as client:
        english = client.get("/api/greeting", headers={"Accept-Language": "en"})
        chinese = client.get("/api/greeting", headers={"Accept-Language": "zh-CN"})

    assert english.headers["vary"] == "Accept-Language"
    assert chinese.headers["vary"] == "Accept-Language"
    assert english.headers["etag"] != chinese.headers["etag"]
    assert chinese.json()["message"] == "你好，缓存"


def test_private_profile_requires_validation_and_varies_on_identity() -> None:
    with TestClient(create_app()) as client:
        response = client.get(
            "/api/me", headers={"Authorization": "Bearer alice-token"}
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-cache"
    assert response.headers["vary"] == "Authorization"


def test_sensitive_response_is_not_stored() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/payment-secret")

    assert response.headers["cache-control"] == "no-store"


def test_content_addressed_asset_can_be_cached_for_a_year() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/assets/app.4f3a2c.js")

    assert response.status_code == 200
    assert response.headers["cache-control"] == (
        "public, max-age=31536000, immutable"
    )
