from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .application import CatalogService


router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])


class ProductResponse(BaseModel):
    product_id: str
    name: str
    price: str
    active: bool


def get_catalog(request: Request) -> CatalogService:
    return request.app.state.container.catalog


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: str,
    catalog: Annotated[CatalogService, Depends(get_catalog)],
) -> ProductResponse:
    product = catalog.find_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="product not found")
    return ProductResponse(
        product_id=product.product_id,
        name=product.name,
        price=str(product.price),
        active=product.active,
    )
