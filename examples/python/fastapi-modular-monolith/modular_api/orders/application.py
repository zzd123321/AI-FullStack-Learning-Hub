from dataclasses import dataclass
from decimal import Decimal

from .domain import InvalidOrderError, Order
from .ports import ProductCatalog, UnitOfWorkFactory


class ProductNotAvailableError(LookupError):
    pass


class OrderAlreadyExistsError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class PlaceOrderCommand:
    order_id: str
    product_id: str
    quantity: int


@dataclass(frozen=True, slots=True)
class OrderView:
    order_id: str
    product_id: str
    product_name: str
    unit_price: Decimal
    quantity: int
    total: Decimal
    status: str


class PlaceOrderHandler:
    def __init__(self, catalog: ProductCatalog, uow_factory: UnitOfWorkFactory) -> None:
        self.catalog = catalog
        self.uow_factory = uow_factory

    def handle(self, command: PlaceOrderCommand) -> OrderView:
        product = self.catalog.get_snapshot(command.product_id)
        if product is None or not product.active:
            raise ProductNotAvailableError("product is not available")

        order = Order.place(
            command.order_id,
            product.product_id,
            product.name,
            product.price,
            command.quantity,
        )
        with self.uow_factory() as uow:
            if uow.orders.get(command.order_id) is not None:
                raise OrderAlreadyExistsError("order already exists")
            uow.orders.add(order)
            for event in order.events:
                uow.outbox.add(event)
            uow.commit()
        return OrderView(
            order.order_id,
            order.product_id,
            order.product_name,
            order.unit_price,
            order.quantity,
            order.total,
            order.status,
        )
