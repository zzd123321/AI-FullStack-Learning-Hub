from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Product:
    product_id: str
    name: str
    price: Decimal
    active: bool = True
