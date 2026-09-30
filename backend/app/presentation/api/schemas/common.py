from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.domain.value_objects.pagination import Page

T = TypeVar("T")

# Money: 2 decimals, non-negative. Serialized as a string in JSON to keep precision.
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
LongName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
Description = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=2000)]


_media_url_prefix = "/media"


def configure_media_url(prefix: str) -> None:
    """Called once by the app factory with ``settings.media_url``."""
    global _media_url_prefix
    _media_url_prefix = prefix.rstrip("/")


def media_url(path: str | None) -> str | None:
    """Public URL of a stored file; None means the client shows its default image."""
    return f"{_media_url_prefix}/{path}" if path else None


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StatusUpdateRequest(RequestSchema):
    estado: bool


class PageResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int

    @classmethod
    def from_page(cls, page: Page, item_schema: type[BaseModel]) -> "PageResponse":
        return cls(
            items=[item_schema.model_validate(i) for i in page.items],
            total=page.total,
            page=page.page,
            size=page.size,
            pages=page.pages,
        )


class ErrorBody(BaseModel):
    code: str
    message: str
    details: object | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
