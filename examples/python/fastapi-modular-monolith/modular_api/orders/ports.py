from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from .domain import Order, OrderPlaced


@dataclass(frozen=True, slots=True)
class ProductSnapshot:
    product_id: str
    name: str
    price: Decimal
    active: bool


class ProductCatalog(Protocol):
    def get_snapshot(self, product_id: str) -> ProductSnapshot | None: ...


class OrderRepository(Protocol):
    def get(self, order_id: str) -> Order | None: ...
    def add(self, order: Order) -> None: ...


class EventOutbox(Protocol):
    def add(self, event: OrderPlaced) -> None: ...


class OrderUnitOfWork(Protocol):
    orders: OrderRepository
    outbox: EventOutbox

    def __enter__(self) -> "OrderUnitOfWork": ...
    def __exit__(self, *args: object) -> None: ...
    def commit(self) -> None: ...


class UnitOfWorkFactory(Protocol):
    def __call__(self) -> OrderUnitOfWork: ...
