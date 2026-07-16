from .domain import Product


class InMemoryProductRepository:
    def __init__(self, products: list[Product]) -> None:
        self._products = {product.product_id: product for product in products}
        self.read_count = 0

    def get(self, product_id: str) -> Product | None:
        self.read_count += 1
        return self._products.get(product_id)

    def put(self, product: Product) -> None:
        self._products[product.product_id] = product
