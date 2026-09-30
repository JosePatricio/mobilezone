"""Test fixtures.

Database tests run against a dedicated MySQL database whose name must contain
"test" (its tables are dropped and recreated). Configure it with::

    TEST_DATABASE_URL=mysql+pymysql://mobilezone:change-me@localhost:3306/mobilezone_test?charset=utf8mb4

(environment variable or backend/.env). Without it, database tests are skipped
and only the pure domain / script tests run.
"""
from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url

from app.domain.entities import Brand, Category, DeviceModel, Product, SparePart, User
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.enums import SystemRole
from app.infrastructure.config.settings import Settings
from app.infrastructure.database.seed import seed
from app.infrastructure.database.sql_scripts import CREATE_TABLES, DROP_TABLES, run_script
from app.infrastructure.database.tables import metadata
from app.infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork
from app.presentation.api.factory import create_app

PASSWORD = "Secret1234"


def _test_database_url() -> str | None:
    return Settings().test_database_url


@pytest.fixture(scope="session")
def mysql_engine() -> Iterator[Engine]:
    """Creates the schema once per test session from db_scripts/02_create_tables.sql."""
    url = _test_database_url()
    if not url:
        pytest.skip("TEST_DATABASE_URL not configured: MySQL database tests skipped.")
    database = make_url(url).database or ""
    if "test" not in database.lower():
        pytest.exit(f"Refusing to run tests on database '{database}': its name must contain 'test'.")
    engine = create_engine(url, pool_pre_ping=True)
    with engine.begin() as conn:
        run_script(conn, DROP_TABLES)
        run_script(conn, CREATE_TABLES)
    yield engine
    engine.dispose()


def truncate_all(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql("SET FOREIGN_KEY_CHECKS = 0")
        for table in metadata.sorted_tables:
            conn.exec_driver_sql(f"TRUNCATE TABLE `{table.name}`")
        conn.exec_driver_sql("SET FOREIGN_KEY_CHECKS = 1")


@pytest.fixture
def settings(mysql_engine: Engine, tmp_path) -> Settings:
    return Settings(
        _env_file=None,
        media_dir=str(tmp_path / "media"),
        database_url=mysql_engine.url.render_as_string(hide_password=False),
        bcrypt_rounds=4,
        jwt_secret_key="test-secret-key-that-is-long-enough-1234567890",
        admin_email="admin@example.com",
        admin_password=PASSWORD,
    )


@pytest.fixture
def app(settings: Settings, mysql_engine: Engine) -> Iterator[FastAPI]:
    truncate_all(mysql_engine)
    application = create_app(settings)
    session = application.state.session_factory()
    seed(session, settings, application.state.password_hasher)
    session.close()
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def uow(app: FastAPI) -> Iterator[UnitOfWork]:
    session = app.state.session_factory()
    try:
        yield SqlAlchemyUnitOfWork(session)
    finally:
        session.close()


class Factory:
    """Creates persisted test data directly through the Unit of Work."""

    def __init__(self, uow: UnitOfWork, app: FastAPI) -> None:
        self.uow = uow
        self.hasher = app.state.password_hasher
        self._seq = 0

    def _next(self) -> int:
        self._seq += 1
        return self._seq

    def user(self, role: SystemRole = SystemRole.VENDEDOR, estado: bool = True) -> User:
        """A user with the given system role; clients get a cedula and no password."""
        n = self._next()
        role_entity = self.uow.roles.get_by_nombre(role.value)
        is_client = role == SystemRole.CLIENTE
        with self.uow.transaction():
            user = User(
                nombre=f"Nombre{n}",
                apellido=f"Apellido{n}",
                email=f"{role.value.lower()}{n}@example.com",
                rol_id=role_entity.id,
                password=None if is_client else self.hasher.hash(PASSWORD),
                identificacion=f"{1700000000 + n}" if is_client else None,
                estado=estado,
            )
            self.uow.users.add(user)
        return user

    def category(self, nombre: str | None = None) -> Category:
        with self.uow.transaction():
            category = Category(nombre=nombre or f"Categoria {self._next()}")
            self.uow.categories.add(category)
        return category

    def product(self, precio: str = "10.00", stock: int = 10, category: Category | None = None, **kw) -> Product:
        """``precio`` is the PVP (precio_venta)."""
        category = category or self.category()
        n = self._next()
        with self.uow.transaction():
            product = Product(
                category_id=category.id,
                sku=f"SKU-{n}",
                nombre=f"Producto {n}",
                precio_venta=Decimal(precio),
                precio_costo=Decimal(precio) / 2,
                precio_mayor=Decimal(precio) * Decimal("0.9"),
                stock=stock,
                **kw,
            )
            self.uow.products.add(product)
        return product

    def brand_and_model(self) -> tuple[Brand, DeviceModel]:
        n = self._next()
        with self.uow.transaction():
            brand = Brand(nombre=f"Marca {n}")
            self.uow.brands.add(brand)
            self.uow.flush()
            model = DeviceModel(brand_id=brand.id, nombre=f"Modelo {n}")
            self.uow.models.add(model)
        return brand, model

    def spare_part(self, precio: str = "25.00", estado: bool = True) -> SparePart:
        with self.uow.transaction():
            part = SparePart(tipo=f"Repuesto {self._next()}", precio=Decimal(precio), estado=estado)
            self.uow.spare_parts.add(part)
        return part


@pytest.fixture
def factory(uow: UnitOfWork, app: FastAPI) -> Factory:
    return Factory(uow, app)


def auth_headers(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def admin_headers(client: TestClient, settings: Settings) -> dict[str, str]:
    return auth_headers(client, settings.admin_email)
