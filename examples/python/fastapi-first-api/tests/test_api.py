from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from learning_api.app import create_app


class TaskApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client_context = TestClient(create_app())
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)

    def test_lifespan_makes_health_ready(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready"})

    def test_create_then_get_task(self) -> None:
        created = self.client.post(
            "/api/tasks",
            json={"title": "  Learn ASGI  ", "priority": 3},
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.headers["location"], "/api/tasks/1")
        self.assertEqual(
            created.json(),
            {"id": 1, "title": "Learn ASGI", "priority": 3, "completed": False},
        )
        self.assertEqual(self.client.get("/api/tasks/1").json(), created.json())

    def test_request_body_rejects_unknown_fields_with_stable_envelope(self) -> None:
        response = self.client.post(
            "/api/tasks",
            json={"title": "Learn validation", "priority": 2, "admin": True},
        )

        self.assertEqual(response.status_code, 422)
        body = response.json()
        self.assertEqual(body["error"]["code"], "request_validation_failed")
        self.assertEqual(body["error"]["details"][0]["type"], "extra_forbidden")

    def test_path_parameter_validation_uses_same_error_envelope(self) -> None:
        response = self.client.get("/api/tasks/not-an-integer")

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "request_validation_failed")

    def test_missing_task_returns_domain_error_response(self) -> None:
        response = self.client.get("/api/tasks/999")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(),
            {
                "error": {
                    "code": "task_not_found",
                    "message": "Task 999 was not found",
                    "details": None,
                }
            },
        )

    def test_openapi_contains_paths_and_component_schemas(self) -> None:
        schema = self.client.get("/openapi.json").json()

        self.assertIn("/api/tasks", schema["paths"])
        self.assertIn("/api/tasks/{task_id}", schema["paths"])
        self.assertIn("TaskCreate", schema["components"]["schemas"])
        self.assertIn("TaskResponse", schema["components"]["schemas"])
        self.assertIn("ErrorResponse", schema["components"]["schemas"])


if __name__ == "__main__":
    unittest.main()
