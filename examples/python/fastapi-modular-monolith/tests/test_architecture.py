import ast
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from modular_api.adapters import CatalogModuleAdapter, TtlProductCatalog
from modular_api.app import create_app
from modular_api.bootstrap import build_container
from modular_api.catalog.application import CatalogService
from modular_api.catalog.domain import Product
from modular_api.catalog.in_memory import InMemoryProductRepository
from modular_api.orders.application import PlaceOrderCommand
from modular_api.orders.domain import InvalidOrderError, Order
from modular_api.orders.sqlite import SqliteDatabase


def test_domain_enforces_invariant_and_raises_event() -> None:
    order = Order.place("o-1", "p-1", "Book", Decimal("12.50"), 2)
    assert order.total == Decimal("25.00")
    assert order.events[0].total == order.total
    with pytest.raises(InvalidOrderError):
        Order.place("o-2", "p-1", "Book", Decimal("12.50"), 0)


def test_http_use_case_commits_order_and_outbox_together(tmp_path: Path) -> None:
    app = create_app(tmp_path / "orders.db")
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/orders",
            json={"order_id": "order-1", "product_id": "book-1", "quantity": 2},
        )
        assert response.status_code == 201
        assert response.json()["total"] == "119.80"
        database = app.state.container.database
        assert database.count("orders") == database.count("outbox") == 1


def test_duplicate_and_missing_product_map_to_protocol_errors(tmp_path: Path) -> None:
    app = create_app(tmp_path / "errors.db")
    with TestClient(app) as client:
        body = {"order_id": "same", "product_id": "book-1", "quantity": 1}
        assert client.post("/api/v1/orders", json=body).status_code == 201
        assert client.post("/api/v1/orders", json=body).status_code == 409
        missing = {"order_id": "new", "product_id": "missing", "quantity": 1}
        assert client.post("/api/v1/orders", json=missing).status_code == 404


def test_outbox_failure_rolls_back_order(tmp_path: Path) -> None:
    container = build_container(tmp_path / "rollback.db")
    failing = SqliteDatabase(container.database.path, fail_on_outbox=True)
    handler = type(container.place_order)(
        container.place_order.catalog, failing.unit_of_work
    )
    with pytest.raises(RuntimeError, match="outbox"):
        handler.handle(PlaceOrderCommand("o-1", "book-1", 1))
    assert failing.count("orders") == failing.count("outbox") == 0


def test_ttl_cache_is_an_adapter_and_can_be_invalidated() -> None:
    repository = InMemoryProductRepository(
        [Product("p-1", "Old", Decimal("10.00"))]
    )
    clock = [100.0]
    cache = TtlProductCatalog(
        CatalogModuleAdapter(CatalogService(repository)),
        ttl_seconds=10,
        clock=lambda: clock[0],
    )
    assert cache.get_snapshot("p-1").name == "Old"
    repository.put(Product("p-1", "New", Decimal("12.00")))
    assert cache.get_snapshot("p-1").name == "Old"
    cache.invalidate("p-1")
    assert cache.get_snapshot("p-1").name == "New"


def test_domain_and_module_dependency_boundaries_are_machine_checked() -> None:
    package = Path(__file__).parents[1] / "modular_api"
    for domain_file in package.glob("*/domain.py"):
        imported = {
            node.module or ""
            for node in ast.walk(ast.parse(domain_file.read_text()))
            if isinstance(node, ast.ImportFrom)
        }
        assert not any("fastapi" in name or "sqlite" in name for name in imported)

    for order_file in (package / "orders").glob("*.py"):
        assert "modular_api.catalog" not in order_file.read_text()
        assert "..catalog" not in order_file.read_text()
