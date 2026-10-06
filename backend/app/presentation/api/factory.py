from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.infrastructure.config.settings import Settings, get_settings
from app.infrastructure.database.session import build_engine, build_session_factory
from app.infrastructure.security.jwt_tokens import JwtTokenService
from app.infrastructure.security.passwords import BcryptPasswordHasher
from app.infrastructure.pdf.receipt import ReportLabReceiptRenderer
from app.infrastructure.storage.local import LocalFileStorage
from app.presentation.api.routes import auth, catalog, inventory, products, roles, sales, users, work_orders
from app.presentation.api.routes import settings as settings_routes
from app.presentation.api.schemas.common import configure_media_url
from app.presentation.middleware.errors import register_error_handlers

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)

    app = FastAPI(title=settings.app_name, version="1.0.0", debug=settings.debug)

    engine = build_engine(settings.database_url, settings.database_echo)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)
    app.state.password_hasher = BcryptPasswordHasher(settings.bcrypt_rounds)
    app.state.token_service = JwtTokenService(
        settings.jwt_secret_key, settings.jwt_algorithm, settings.access_token_expire_minutes
    )
    media_dir = Path(settings.media_dir)
    media_dir.mkdir(parents=True, exist_ok=True)
    app.state.file_storage = LocalFileStorage(media_dir)
    app.state.receipt_renderer = ReportLabReceiptRenderer(settings.company_name, settings.timezone)
    configure_media_url(settings.media_url)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    api = APIRouter(prefix=API_PREFIX)
    for router in (
        auth.router,
        users.router,
        users.clients_router,
        roles.router,
        roles.permissions_router,
        catalog.categories,
        products.router,
        inventory.branches,
        inventory.inventory,
        inventory.locations,
        sales.router,
        catalog.brands,
        catalog.models,
        work_orders.router,
        work_orders.public_router,
        catalog.spare_parts,
        settings_routes.router,
    ):
        api.include_router(router)
    app.include_router(api)

    # Uploaded images (products, user photos).
    app.mount("/media", StaticFiles(directory=media_dir), name="media")

    @app.get("/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    return app
