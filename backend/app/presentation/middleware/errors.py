"""Consistent error responses: ``{"error": {"code", "message", "details"}}``."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.exceptions import (
    AuthenticationError,
    ConflictError,
    DomainError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)

logger = logging.getLogger("app.errors")

_STATUS_BY_EXCEPTION: list[tuple[type[DomainError], int]] = [
    (AuthenticationError, 401),
    (PermissionDeniedError, 403),
    (NotFoundError, 404),
    (ConflictError, 409),
    (ValidationError, 400),
]

_CODE_BY_STATUS = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
}


def error_payload(code: str, message: str, details: object | None = None) -> dict:
    body: dict = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return {"error": body}


def status_for(exc: DomainError) -> int:
    for exc_type, status in _STATUS_BY_EXCEPTION:
        if isinstance(exc, exc_type):
            return status
    return 400


async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    status = status_for(exc)
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return JSONResponse(
        status_code=status,
        content=jsonable_encoder(error_payload(exc.code, exc.message, exc.details)),
        headers=headers,
    )


async def request_validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")),
            "message": err.get("msg", ""),
            "type": err.get("type", ""),
        }
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(error_payload("VALIDATION_ERROR", "Los datos enviados no son válidos.", details)),
    )


async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _CODE_BY_STATUS.get(exc.status_code, "HTTP_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else "Error en la solicitud."
    return JSONResponse(status_code=exc.status_code, content=error_payload(code, message), headers=exc.headers)


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    # Internal details are never exposed to clients.
    return JSONResponse(status_code=500, content=error_payload("INTERNAL_ERROR", "Error interno del servidor."))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, domain_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, request_validation_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
