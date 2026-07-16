from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .application import (
    OrderAlreadyExistsError,
    PlaceOrderCommand,
    PlaceOrderHandler,
    ProductNotAvailableError,
)
from .domain import InvalidOrderError


router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


class PlaceOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    order_id: str = Field(min_length=1, max_length=64)
    product_id: str = Field(min_length=1, max_length=64)
    quantity: int = Field(ge=1, le=100)


class OrderResponse(BaseModel):
    order_id: str
    product_id: str
    product_name: str
    unit_price: str
    quantity: int
    total: str
    status: str


def get_handler(request: Request) -> PlaceOrderHandler:
    return request.app.state.container.place_order


@router.post("", status_code=201, response_model=OrderResponse)
def place_order(
    payload: PlaceOrderRequest,
    handler: Annotated[PlaceOrderHandler, Depends(get_handler)],
) -> OrderResponse:
    try:
        result = handler.handle(
            PlaceOrderCommand(payload.order_id, payload.product_id, payload.quantity)
        )
    except ProductNotAvailableError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except OrderAlreadyExistsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except InvalidOrderError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return OrderResponse(
        order_id=result.order_id,
        product_id=result.product_id,
        product_name=result.product_name,
        unit_price=str(result.unit_price),
        quantity=result.quantity,
        total=str(result.total),
        status=result.status,
    )
