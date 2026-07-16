from fastapi.testclient import TestClient

from contract_api.app import create_app


def create_item(client: TestClient, key: str, name: str = "Book"):
    return client.post(
        "/api/v1/items",
        headers={"Idempotency-Key": key},
        json={"name": name, "price": "59.90"},
    )


def test_creation_returns_location_etag_and_safe_replay() -> None:
    with TestClient(create_app()) as client:
        first = create_item(client, "request-001")
        replay = create_item(client, "request-001")
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    assert first.headers["location"].endswith(first.json()["item_id"])
    assert first.headers["etag"] == '"1"'
    assert replay.headers["idempotency-replayed"] == "true"


def test_idempotency_mismatch_uses_problem_details() -> None:
    with TestClient(create_app()) as client:
        create_item(client, "request-001")
        response = create_item(client, "request-001", "Different")
    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["type"].endswith("idempotency-conflict")


def test_etag_prevents_lost_update_and_supports_revalidation() -> None:
    with TestClient(create_app()) as client:
        created = create_item(client, "request-001")
        url = created.headers["location"]
        assert client.get(url, headers={"If-None-Match": '"1"'}).status_code == 304
        assert client.patch(url, json={"name": "New"}).status_code == 428
        updated = client.patch(url, headers={"If-Match": '"1"'}, json={"name": "New"})
        stale = client.patch(url, headers={"If-Match": '"1"'}, json={"name": "Lost"})
    assert updated.status_code == 200
    assert updated.headers["etag"] == '"2"'
    assert stale.status_code == 412


def test_cursor_pagination_has_a_stable_continuation() -> None:
    with TestClient(create_app()) as client:
        for index in range(3):
            create_item(client, f"request-{index:03}", f"Item {index}")
        first = client.get("/api/v1/items", params={"limit": 2}).json()
        second = client.get(
            "/api/v1/items", params={"limit": 2, "cursor": first["next_cursor"]}
        ).json()
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1
    assert {item["item_id"] for item in first["items"]}.isdisjoint(
        {item["item_id"] for item in second["items"]}
    )


def test_validation_and_invalid_cursor_share_problem_contract() -> None:
    with TestClient(create_app()) as client:
        invalid_body = client.post(
            "/api/v1/items",
            headers={"Idempotency-Key": "request-001"},
            json={"name": "", "price": -1, "admin": True},
        )
        invalid_cursor = client.get("/api/v1/items", params={"cursor": "bad"})
    assert invalid_body.status_code == 422
    assert invalid_cursor.status_code == 400
    assert invalid_body.headers["content-type"].startswith("application/problem+json")


def test_delete_is_idempotent_at_the_http_effect_boundary() -> None:
    with TestClient(create_app()) as client:
        created = create_item(client, "request-001")
        url = created.headers["location"]
        assert client.delete(url).status_code == 204
        assert client.delete(url).status_code == 204


def test_openapi_documents_problem_media_type_and_preconditions() -> None:
    with TestClient(create_app()) as client:
        operation = client.get("/openapi.json").json()["paths"][
            "/api/v1/items/{item_id}"
        ]["patch"]
    assert "428" in operation["responses"]
    assert (
        "application/problem+json"
        in operation["responses"]["428"]["content"]
    )
