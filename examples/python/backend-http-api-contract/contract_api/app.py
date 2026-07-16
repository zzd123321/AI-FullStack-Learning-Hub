from decimal import Decimal
from typing import Annotated

from fastapi import FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .store import IdempotencyConflictError, Item, ItemStore


class ApiProblem(Exception):
    def __init__(self, status: int, problem_type: str, title: str, detail: str) -> None:
        self.status = status
        self.problem_type = problem_type
        self.title = title
        self.detail = detail


class ProblemDetails(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str


def problem_response(description: str) -> dict:
    return {
        "description": description,
        "content": {
            "application/problem+json": {
                "schema": ProblemDetails.model_json_schema()
            }
        },
    }


class ItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class ItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @model_validator(mode="after")
    def at_least_one_change(self) -> "ItemPatch":
        if self.name is None and self.price is None:
            raise ValueError("at least one field must be supplied")
        return self


class ItemResponse(BaseModel):
    item_id: str
    name: str
    price: str
    version: int


class ItemPage(BaseModel):
    items: list[ItemResponse]
    next_cursor: str | None


def etag(item: Item) -> str:
    return f'"{item.version}"'


def present(item: Item) -> ItemResponse:
    return ItemResponse(
        item_id=item.item_id,
        name=item.name,
        price=str(item.price),
        version=item.version,
    )


def create_app() -> FastAPI:
    app = FastAPI(title="HTTP Contract API", version="1.0.0")
    store = ItemStore()
    app.state.store = store

    @app.exception_handler(ApiProblem)
    async def problem_handler(request: Request, error: ApiProblem) -> JSONResponse:
        return JSONResponse(
            {
                "type": f"https://api.example.test/problems/{error.problem_type}",
                "title": error.title,
                "status": error.status,
                "detail": error.detail,
                "instance": str(request.url.path),
            },
            status_code=error.status,
            media_type="application/problem+json",
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            {
                "type": "https://api.example.test/problems/validation-error",
                "title": "Request validation failed",
                "status": 422,
                "detail": "One or more request fields are invalid.",
                "instance": str(request.url.path),
                "errors": [
                    {"location": list(issue["loc"]), "message": issue["msg"]}
                    for issue in error.errors()
                ],
            },
            status_code=422,
            media_type="application/problem+json",
        )

    @app.post(
        "/api/v1/items",
        status_code=201,
        response_model=ItemResponse,
        responses={
            409: problem_response("Idempotency key conflict"),
            422: problem_response("Request validation failed"),
        },
    )
    def create_item(
        payload: ItemCreate,
        response: Response,
        idempotency_key: Annotated[
            str, Header(alias="Idempotency-Key", min_length=8, max_length=64)
        ],
    ) -> ItemResponse:
        try:
            item, replayed = store.create(idempotency_key, payload.name, payload.price)
        except IdempotencyConflictError as error:
            raise ApiProblem(409, "idempotency-conflict", "Request conflict", str(error))
        response.headers["Location"] = f"/api/v1/items/{item.item_id}"
        response.headers["ETag"] = etag(item)
        response.headers["Idempotency-Replayed"] = str(replayed).lower()
        return present(item)

    @app.get(
        "/api/v1/items",
        response_model=ItemPage,
        responses={400: problem_response("Invalid cursor")},
    )
    def list_items(
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        cursor: str | None = None,
    ) -> ItemPage:
        try:
            page = store.page(limit, cursor)
        except ValueError as error:
            raise ApiProblem(400, "invalid-cursor", "Invalid cursor", str(error))
        return ItemPage(
            items=[present(item) for item in page.items],
            next_cursor=page.next_cursor,
        )

    @app.get(
        "/api/v1/items/{item_id}",
        response_model=ItemResponse,
        responses={
            304: {"description": "Representation has not changed"},
            404: problem_response("Item not found"),
        },
    )
    def get_item(
        item_id: str,
        response: Response,
        if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
    ):
        item = store.get(item_id)
        if item is None:
            raise ApiProblem(404, "item-not-found", "Item not found", "No item exists.")
        current_etag = etag(item)
        if if_none_match == current_etag:
            return Response(status_code=304, headers={"ETag": current_etag})
        response.headers["ETag"] = current_etag
        return present(item)

    @app.patch(
        "/api/v1/items/{item_id}",
        response_model=ItemResponse,
        responses={
            400: problem_response("Malformed ETag"),
            404: problem_response("Item not found"),
            412: problem_response("ETag no longer matches"),
            428: problem_response("If-Match is required"),
            422: problem_response("Request validation failed"),
        },
    )
    def patch_item(
        item_id: str,
        payload: ItemPatch,
        response: Response,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ItemResponse:
        if if_match is None:
            raise ApiProblem(
                428, "precondition-required", "Precondition required", "Send If-Match."
            )
        try:
            expected_version = int(if_match.strip('"'))
        except ValueError as error:
            raise ApiProblem(
                400, "invalid-etag", "Invalid ETag", "If-Match is malformed."
            ) from error
        try:
            item = store.update(item_id, expected_version, payload.name, payload.price)
        except ValueError as error:
            raise ApiProblem(
                412, "precondition-failed", "Precondition failed", str(error)
            ) from error
        if item is None:
            raise ApiProblem(404, "item-not-found", "Item not found", "No item exists.")
        response.headers["ETag"] = etag(item)
        return present(item)

    @app.delete("/api/v1/items/{item_id}", status_code=204)
    def delete_item(item_id: str) -> Response:
        store.delete(item_id)
        return Response(status_code=204)

    return app
