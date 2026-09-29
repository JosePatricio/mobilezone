"""Domain exceptions.

Each exception carries a stable, machine readable ``code`` that the presentation
layer exposes to API clients. HTTP status mapping lives in the presentation layer
so the domain stays framework agnostic.
"""
from __future__ import annotations

from typing import Any


class DomainError(Exception):
    code = "DOMAIN_ERROR"

    def __init__(self, message: str, code: str | None = None, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        self.details = details


class ValidationError(DomainError):
    """Input that violates a business rule (maps to 400)."""

    code = "VALIDATION_ERROR"


class NotFoundError(DomainError):
    code = "NOT_FOUND"


class ConflictError(DomainError):
    code = "CONFLICT"


class InsufficientStockError(ConflictError):
    code = "INSUFFICIENT_STOCK"

    def __init__(self, product_id: int, requested: int, available: int, product_name: str | None = None) -> None:
        name = f" '{product_name}'" if product_name else ""
        super().__init__(
            f"Stock insuficiente para el producto{name}. Disponible: {available}, solicitado: {requested}.",
            details={"product_id": product_id, "requested": requested, "available": available},
        )


class AuthenticationError(DomainError):
    code = "UNAUTHENTICATED"


class PermissionDeniedError(DomainError):
    code = "FORBIDDEN"
