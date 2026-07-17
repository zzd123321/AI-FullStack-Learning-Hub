import hashlib
import json
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field


@dataclass(frozen=True)
class Product:
    product_id: str
    name: str
    price: str


class CatalogStore:
    """A process-local store used only to make representation changes observable."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._version = 1
        self._products = [
            Product("p-100", "Mechanical Keyboard", "699.00"),
            Product("p-200", "USB-C Dock", "399.00"),
        ]

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "version": self._version,
                "products": [asdict(product) for product in self._products],
            }

    def rename(self, product_id: str, name: str) -> dict | None:
        with self._lock:
            updated: list[Product] = []
            found = False
            for product in self._products:
                if product.product_id == product_id:
                    updated.append(Product(product.product_id, name, product.price))
                    found = True
                else:
                    updated.append(product)
            if not found:
                return None
            self._products = updated
            self._version += 1
            return {
                "version": self._version,
                "products": [asdict(product) for product in self._products],
            }


class ProductRename(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def strong_etag(value: object) -> str:
    digest = hashlib.sha256(canonical_json(value)).hexdigest()
    return f'"{digest}"'


def cache_headers(
    *, etag: str, cache_control: str, vary: str | None = None
) -> dict[str, str]:
    headers = {"ETag": etag, "Cache-Control": cache_control}
    if vary is not None:
        headers["Vary"] = vary
    return headers


def conditional_json(
    value: object,
    *,
    if_none_match: str | None,
    cache_control: str,
    vary: str | None = None,
) -> Response:
    # ETag 必须由最终表示生成；同一份内容才能稳定得到同一个验证标识。
    body = canonical_json(value)
    etag = strong_etag(value)
    headers = cache_headers(etag=etag, cache_control=cache_control, vary=vary)
    if if_none_match == etag:
        # 内容未变，只返回元数据。浏览器/CDN 可以继续复用原响应体。
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


def create_app() -> FastAPI:
    app = FastAPI(title="HTTP Cache API", version="1.0.0")
    store = CatalogStore()
    app.state.store = store

    @app.get("/api/catalog")
    def get_catalog(
        if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
    ) -> Response:
        return conditional_json(
            store.snapshot(),
            if_none_match=if_none_match,
            cache_control=(
                "public, max-age=10, s-maxage=60, "
                "stale-while-revalidate=30, stale-if-error=300"
            ),
        )

    @app.patch("/api/catalog/products/{product_id}")
    def rename_product(product_id: str, payload: ProductRename) -> Response:
        snapshot = store.rename(product_id, payload.name)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="product not found")
        # The unsafe request updates this URI; clients must not reuse its response.
        return Response(
            content=canonical_json(snapshot),
            media_type="application/json",
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/greeting")
    def get_greeting(
        accept_language: Annotated[
            str, Header(alias="Accept-Language")
        ] = "en",
        if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
    ) -> Response:
        language = "zh-CN" if accept_language.lower().startswith("zh") else "en"
        value = {
            "language": language,
            "message": "你好，缓存" if language == "zh-CN" else "Hello, cache",
        }
        return conditional_json(
            value,
            if_none_match=if_none_match,
            cache_control="public, max-age=60",
            vary="Accept-Language",
        )

    @app.get("/api/me")
    def get_profile(
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
        if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
    ) -> Response:
        if authorization != "Bearer alice-token":
            raise HTTPException(status_code=401, detail="invalid bearer token")
        value = {"user_id": "u-100", "display_name": "Alice"}
        return conditional_json(
            value,
            if_none_match=if_none_match,
            # private 禁止共享缓存复用；no-cache 要求每次使用前向源站确认。
            cache_control="private, no-cache",
            vary="Authorization",
        )

    @app.get("/api/payment-secret")
    def get_payment_secret() -> Response:
        # 一次性敏感数据连私有缓存也不应保存，所以使用 no-store。
        return Response(
            content=canonical_json({"one_time_secret": "demo-only"}),
            media_type="application/json",
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/assets/app.4f3a2c.js")
    def get_hashed_asset() -> Response:
        return Response(
            content=b'console.log("content-addressed asset");\n',
            media_type="text/javascript",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    return app
