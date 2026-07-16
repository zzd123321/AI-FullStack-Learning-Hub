from concurrent.futures import ThreadPoolExecutor

from cache_learning.service import ManualClock, ProductRepository, ProductService, TtlCache


def test_cache_aside_reads_database_once_until_ttl_expires() -> None:
    clock = ManualClock()
    repository = ProductRepository()
    service = ProductService(repository, TtlCache(clock), value_ttl=10)

    assert service.get("p-100").name == "Mechanical Keyboard"
    assert service.get("p-100").name == "Mechanical Keyboard"
    assert repository.read_count == 1

    clock.advance(10)
    assert service.get("p-100").name == "Mechanical Keyboard"
    assert repository.read_count == 2


def test_negative_cache_distinguishes_missing_value_from_cache_miss() -> None:
    clock = ManualClock()
    repository = ProductRepository()
    service = ProductService(repository, TtlCache(clock), missing_ttl=2)

    assert service.get("missing") is None
    assert service.get("missing") is None
    assert repository.read_count == 1

    clock.advance(2)
    assert service.get("missing") is None
    assert repository.read_count == 2


def test_singleflight_collapses_concurrent_cold_misses_in_one_process() -> None:
    repository = ProductRepository(read_delay=0.05)
    service = ProductService(repository, TtlCache())

    with ThreadPoolExecutor(max_workers=8) as executor:
        products = list(executor.map(lambda _: service.get("p-100"), range(8)))

    assert {product.name for product in products} == {"Mechanical Keyboard"}
    assert repository.read_count == 1


def test_write_publishes_new_revision_to_cache() -> None:
    repository = ProductRepository()
    cache = TtlCache()
    service = ProductService(repository, cache)
    old = service.get("p-100")

    updated = service.rename("p-100", "Quiet Keyboard")

    assert updated.revision == old.revision + 1
    assert service.get("p-100").name == "Quiet Keyboard"
    assert repository.read_count == 1


def test_late_old_fill_cannot_overwrite_a_newer_cached_revision() -> None:
    cache = TtlCache()
    key = ProductService.cache_key("p-100")
    repository = ProductRepository()
    old = repository.get("p-100")
    new = repository.rename("p-100", "Quiet Keyboard")

    assert cache.set_if_newer(key, new, revision=new.revision, ttl_seconds=60)
    assert not cache.set_if_newer(key, old, revision=old.revision, ttl_seconds=60)
    assert cache.get(key).value.name == "Quiet Keyboard"


def test_expired_entries_are_removed_on_read() -> None:
    clock = ManualClock()
    cache = TtlCache(clock)
    repository = ProductRepository()
    product = repository.get("p-100")
    key = ProductService.cache_key("p-100")
    cache.set_if_newer(key, product, revision=1, ttl_seconds=1)

    clock.advance(1)

    assert cache.get(key).hit is False
