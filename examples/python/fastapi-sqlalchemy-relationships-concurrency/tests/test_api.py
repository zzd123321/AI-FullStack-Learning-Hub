from fastapi.testclient import TestClient

from .conftest import create_project_and_task


def test_list_returns_projects_and_eagerly_loaded_tasks(client: TestClient) -> None:
    create_project_and_task(client)
    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    assert response.json()[0]["tasks"][0]["title"] == "Task"


def test_etag_prevents_lost_update(client: TestClient) -> None:
    _, task_id = create_project_and_task(client)
    fetched = client.get(f"/api/v1/tasks/{task_id}")
    first = client.patch(
        f"/api/v1/tasks/{task_id}",
        headers={"If-Match": fetched.headers["etag"]},
        json={"title": "First editor wins"},
    )
    stale = client.patch(
        f"/api/v1/tasks/{task_id}",
        headers={"If-Match": fetched.headers["etag"]},
        json={"title": "Second editor overwrites"},
    )
    assert first.status_code == 200
    assert first.headers["etag"] == '"2"'
    assert stale.status_code == 412
    assert client.get(f"/api/v1/tasks/{task_id}").json()["title"] == "First editor wins"


def test_patch_rejects_empty_null_and_malformed_precondition(client: TestClient) -> None:
    _, task_id = create_project_and_task(client)
    assert client.patch(f"/api/v1/tasks/{task_id}", headers={"If-Match": '"1"'}, json={}).status_code == 422
    assert client.patch(f"/api/v1/tasks/{task_id}", headers={"If-Match": '"1"'}, json={"title": None}).status_code == 422
    malformed = client.patch(f"/api/v1/tasks/{task_id}", headers={"If-Match": "1"}, json={"completed": True})
    assert malformed.status_code == 400


def test_database_cascade_deletes_children(client: TestClient) -> None:
    project_id, task_id = create_project_and_task(client)
    deleted = client.delete(f"/api/v1/projects/{project_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/tasks/{task_id}").status_code == 404
