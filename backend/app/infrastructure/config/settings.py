from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MobileZone API"
    company_name: str = "MobileZone"  # shown on the PDF receipts
    timezone: str = "America/Guayaquil"  # used to print dates on receipts
    environment: str = "development"
    debug: bool = False

    # MySQL 8.0.16+ or MariaDB 10.4+ through PyMySQL. URL-encode special characters in the password.
    database_url: str = "mysql+pymysql://mobilezone:change-me@localhost:3306/mobilezone?charset=utf8mb4"
    # Separate database used by the automated tests (see tests/conftest.py).
    test_database_url: str | None = None
    database_echo: bool = False

    # Uploaded files (product images, user photos). Served by the API under media_url.
    media_dir: str = "media"
    # Public prefix of uploaded files. Use an absolute URL (https://api.example.com/media)
    # when the frontend is served from another origin.
    media_url: str = "/media"

    jwt_secret_key: str = Field(default="change-me-in-production-please-use-a-long-random-value", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    # "Mantener la sesión iniciada" on the login screen: longer session, shared by every tab.
    remember_token_expire_days: int = 30

    bcrypt_rounds: int = 12

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Initial administrator created by the seed script.
    admin_email: str = "admin@example.com"
    admin_password: str = "Admin12345"
    admin_nombre: str = "Administrador"
    admin_apellido: str = "Sistema"


@lru_cache
def get_settings() -> Settings:
    return Settings()
