from fastapi.testclient import TestClient


def task_payload(title: str, priority: int = 3) -> dict[str, object]:
    return {
        "title": title,
        "description": "Persisted by SQLAlchemy",
        "priority": priority,
    }


def test_health_checks_database_connection(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_create_commits_and_a_later_request_reads_the_row(client: TestClient) -> None:
    created = client.post("/api/v1/tasks", json=task_payload("Learn flush and commit", 5))
    fetched = client.get(created.headers["location"])

    assert created.status_code == 201
    assert created.json()["id"] == 1
    assert created.json()["status"] == "pending"
    assert created.json()["created_at"] is not None
    assert fetched.status_code == 200
    assert fetched.json() == created.json()


def test_duplicate_constraint_becomes_conflict(client: TestClient) -> None:
    first = client.post("/api/v1/tasks", json=task_payload("Unique title"))
    duplicate = client.post("/api/v1/tasks", json=task_payload("Unique title"))

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "duplicate_task_title"


def test_batch_failure_rolls_back_every_row(client: TestClient) -> None:
    client.post("/api/v1/tasks", json=task_payload("Already exists"))

    failed = client.post(
        "/api/v1/tasks/batch",
        json={
            "tasks": [
                task_payload("Must be rolled back"),
                task_payload("Already exists"),
            ]
        },
    )
    page = client.get("/api/v1/tasks?limit=100")

    assert failed.status_code == 409
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert [item["title"] for item in page.json()["items"]] == ["Already exists"]


def test_list_filters_and_paginates_with_stable_order(client: TestClient) -> None:
    client.post("/api/v1/tasks", json=task_payload("First"))
    client.post("/api/v1/tasks", json=task_payload("Second"))
    response = client.get("/api/v1/tasks?status=pending&offset=1&limit=1")

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert response.json()["offset"] == 1
    assert [item["title"] for item in response.json()["items"]] == ["Second"]


def test_missing_task_is_not_found(client: TestClient) -> None:
    response = client.get("/api/v1/tasks/999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "task_not_found"
