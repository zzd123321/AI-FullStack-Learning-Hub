from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic

from .catalog.application import CatalogService
from .orders.ports import ProductCatalog, ProductSnapshot


class CatalogModuleAdapter:
    def __init__(self, catalog: CatalogService) -> None:
        self.catalog = catalog

    def get_snapshot(self, product_id: str) -> ProductSnapshot | None:
        product = self.catalog.find_product(product_id)
        if product is None:
            return None
        return ProductSnapshot(
            product.product_id, product.name, product.price, product.active
        )


@dataclass(frozen=True, slots=True)
class CacheEntry:
    value: ProductSnapshot | None
    expires_at: float


class TtlProductCatalog:
    def __init__(
        self,
        inner: ProductCatalog,
        ttl_seconds: float = 5,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        self.inner = inner
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self.entries: dict[str, CacheEntry] = {}

    def get_snapshot(self, product_id: str) -> ProductSnapshot | None:
        now = self.clock()
        cached = self.entries.get(product_id)
        if cached is not None and cached.expires_at > now:
            return cached.value
        value = self.inner.get_snapshot(product_id)
        self.entries[product_id] = CacheEntry(value, now + self.ttl_seconds)
        return value

    def invalidate(self, product_id: str) -> None:
        self.entries.pop(product_id, None)
