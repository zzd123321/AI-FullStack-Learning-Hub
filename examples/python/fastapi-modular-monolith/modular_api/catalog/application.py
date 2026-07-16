from typing import Protocol

from .domain import Product


class ProductReader(Protocol):
    def get(self, product_id: str) -> Product | None: ...


class CatalogService:
    def __init__(self, products: ProductReader) -> None:
        self.products = products

    def find_product(self, product_id: str) -> Product | None:
        return self.products.get(product_id)
