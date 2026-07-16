from dataclasses import dataclass, field
from decimal import Decimal


class InvalidOrderError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class OrderPlaced:
    order_id: str
    product_id: str
    total: Decimal


@dataclass(slots=True)
class Order:
    order_id: str
    product_id: str
    product_name: str
    unit_price: Decimal
    quantity: int
    status: str = "placed"
    events: list[OrderPlaced] = field(default_factory=list, repr=False)

    @classmethod
    def place(
        cls,
        order_id: str,
        product_id: str,
        product_name: str,
        unit_price: Decimal,
        quantity: int,
    ) -> "Order":
        if quantity < 1:
            raise InvalidOrderError("quantity must be positive")
        if unit_price < 0:
            raise InvalidOrderError("unit price cannot be negative")
        order = cls(order_id, product_id, product_name, unit_price, quantity)
        order.events.append(OrderPlaced(order_id, product_id, order.total))
        return order

    @property
    def total(self) -> Decimal:
        return self.unit_price * self.quantity
