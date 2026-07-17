from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from .adapters import CatalogModuleAdapter, TtlProductCatalog
from .catalog.application import CatalogService
from .catalog.domain import Product
from .catalog.in_memory import InMemoryProductRepository
from .orders.application import PlaceOrderHandler
from .orders.sqlite import SqliteDatabase


@dataclass(frozen=True, slots=True)
class Container:
    catalog: CatalogService
    place_order: PlaceOrderHandler
    database: SqliteDatabase
    product_repository: InMemoryProductRepository


def build_container(database_path: Path) -> Container:
    # Composition root 是唯一认识所有具体实现的地方；领域与用例只依赖 port。
    products = InMemoryProductRepository(
        [Product("book-1", "Python Architecture", Decimal("59.90"))]
    )
    catalog = CatalogService(products)
    # 装饰器在 port 外添加缓存，订单用例无需知道缓存或目录模块内部结构。
    catalog_port = TtlProductCatalog(CatalogModuleAdapter(catalog))
    database = SqliteDatabase(database_path)
    database.initialize()  # 教学示例；生产 schema 由独立 Alembic migration 管理
    # Handler 接收业务协作者，不依赖 FastAPI Request 或全局 app.state。
    place_order = PlaceOrderHandler(catalog_port, database.unit_of_work)
    return Container(catalog, place_order, database, products)
