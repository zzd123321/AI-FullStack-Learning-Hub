from __future__ import annotations

import copy
import time
from dataclasses import dataclass
from threading import Lock
from typing import Callable


@dataclass(frozen=True)
class Product:
    product_id: str
    name: str
    price: str
    revision: int


@dataclass(frozen=True)
class CacheLookup:
    hit: bool
    value: Product | None = None


@dataclass
class CacheEntry:
    value: Product | None
    revision: int
    expires_at: float


class ManualClock:
    def __init__(self) -> None:
        self._now = 0.0

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


class TtlCache:
    """A tiny stand-in for remote Redis; every operation is atomic under one lock."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._entries: dict[str, CacheEntry] = {}
        self._lock = Lock()

    def get(self, key: str) -> CacheLookup:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return CacheLookup(hit=False)
            if entry.expires_at <= self._clock():
                del self._entries[key]
                return CacheLookup(hit=False)
            # A stored None is a negative-cache hit, not a cache miss.
            return CacheLookup(hit=True, value=copy.deepcopy(entry.value))

    def set_if_newer(
        self, key: str, value: Product | None, revision: int, ttl_seconds: float
    ) -> bool:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        with self._lock:
            current = self._entries.get(key)
            if current is not None and current.revision > revision:
                return False
            self._entries[key] = CacheEntry(
                value=copy.deepcopy(value),
                revision=revision,
                expires_at=self._clock() + ttl_seconds,
            )
            return True

    def delete(self, key: str) -> None:
        with self._lock:
            self._entries.pop(key, None)


class ProductRepository:
    """The database is authoritative; delays make concurrent cache misses visible."""

    def __init__(self, read_delay: float = 0.0) -> None:
        self._products = {
            "p-100": Product("p-100", "Mechanical Keyboard", "699.00", 1)
        }
        self._read_delay = read_delay
        self._lock = Lock()
        self.read_count = 0

    def get(self, product_id: str) -> Product | None:
        with self._lock:
            self.read_count += 1
            product = copy.deepcopy(self._products.get(product_id))
        if self._read_delay:
            time.sleep(self._read_delay)
        return product

    def rename(self, product_id: str, name: str) -> Product:
        with self._lock:
            current = self._products[product_id]
            updated = Product(
                current.product_id, name, current.price, current.revision + 1
            )
            self._products[product_id] = updated
            return copy.deepcopy(updated)


class ProductService:
    def __init__(
        self,
        repository: ProductRepository,
        cache: TtlCache,
        *,
        value_ttl: float = 60.0,
        missing_ttl: float = 2.0,
    ) -> None:
        self._repository = repository
        self._cache = cache
        self._value_ttl = value_ttl
        self._missing_ttl = missing_ttl
        self._locks: dict[str, Lock] = {}
        self._locks_guard = Lock()

    @staticmethod
    def cache_key(product_id: str) -> str:
        return f"learning:product:v1:{product_id}"

    def _singleflight_lock(self, key: str) -> Lock:
        with self._locks_guard:
            return self._locks.setdefault(key, Lock())

    def get(self, product_id: str) -> Product | None:
        key = self.cache_key(product_id)
        # cache-aside：先看缓存；命中时不访问权威数据源。
        cached = self._cache.get(key)
        if cached.hit:
            return cached.value

        # Only one thread in this process fills this key. Waiting threads check again.
        with self._singleflight_lock(key):
            cached = self._cache.get(key)
            if cached.hit:
                return cached.value

            product = self._repository.get(product_id)
            if product is None:
                # 短暂缓存“不存在”，避免热点不存在 ID 持续击穿数据源。
                self._cache.set_if_newer(
                    key, None, revision=0, ttl_seconds=self._missing_ttl
                )
                return None

            self._cache.set_if_newer(
                key, product, revision=product.revision, ttl_seconds=self._value_ttl
            )
            return product

    def rename(self, product_id: str, name: str) -> Product:
        # 先提交权威数据源；缓存只是副本，缓存失败不能把业务事实“撤销”。
        updated = self._repository.rename(product_id, name)
        # 带版本写缓存，防止并发中的旧查询结果晚到后覆盖新值。
        self._cache.set_if_newer(
            self.cache_key(product_id),
            updated,
            revision=updated.revision,
            ttl_seconds=self._value_ttl,
        )
        return updated
