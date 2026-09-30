"""Keeps backend/db_scripts in sync with the SQLAlchemy metadata and the permission catalog.

The structural checks need no database; the last test executes the seed script on MySQL.
"""
from __future__ import annotations

import re

import pytest
from sqlalchemy import Engine

from app.domain.value_objects.permissions import DEFAULT_ROLES, PERMISSION_CATALOG
from app.infrastructure.database.sql_scripts import (
    CREATE_TABLES,
    DB_SCRIPTS_DIR,
    DROP_TABLES,
    SEED_DATA,
    read_statements,
    run_script,
)
from app.infrastructure.database.tables import metadata

create_statements = read_statements(CREATE_TABLES)


def _create_table_block(name: str) -> str:
    for statement in create_statements:
        if re.match(rf"CREATE TABLE {name} \(", statement.strip()):
            return statement
    raise AssertionError(f"CREATE TABLE {name} missing in {CREATE_TABLES}")


@pytest.mark.parametrize("table", metadata.sorted_tables, ids=lambda t: t.name)
def test_every_table_and_column_is_scripted(table):
    block = _create_table_block(table.name)
    for column in table.columns:
        assert re.search(rf"^\s+{column.name}\s", block, re.M), f"{table.name}.{column.name} missing"
    scripted_columns = re.findall(r"^\s{4}(\w+)\s+(?:INTEGER|VARCHAR|TEXT|BOOL|DECIMAL|DATETIME|DATE)", block, re.M)
    assert sorted(scripted_columns) == sorted(c.name for c in table.columns), f"extra columns in {table.name}"
    for constraint in table.constraints:
        if constraint.name:
            assert re.search(rf"CONSTRAINT {constraint.name}\s", block), f"constraint {constraint.name} missing"
    for index in table.indexes:
        assert any(f"CREATE INDEX {index.name} ON {table.name} " in s for s in create_statements), index.name
    assert "ENGINE=InnoDB" in block


def test_no_unknown_tables_scripted():
    scripted = {m.group(1) for s in create_statements if (m := re.match(r"\s*CREATE TABLE (\w+)", s))}
    assert scripted == set(metadata.tables)


def test_drop_script_drops_every_table_in_dependency_order():
    dropped = [re.match(r"DROP TABLE IF EXISTS (\w+)", s).group(1) for s in read_statements(DROP_TABLES)]
    assert set(dropped) == set(metadata.tables)
    order = [t.name for t in reversed(metadata.sorted_tables)]
    for child in metadata.sorted_tables:
        for fk in child.foreign_keys:
            if fk.column.table.name != child.name:
                assert dropped.index(child.name) < dropped.index(fk.column.table.name), order


def test_seed_script_matches_permission_catalog():
    seed_sql = (DB_SCRIPTS_DIR / SEED_DATA).read_text(encoding="utf-8")
    scripted = set(re.findall(r"\('([a-z_.]+)', '", seed_sql))
    assert scripted == set(PERMISSION_CATALOG)
    for role, codes in DEFAULT_ROLES.items():
        assert f"('{role}'," in seed_sql
        if not codes:
            assert f"WHERE r.nombre = '{role}'" not in seed_sql
        elif role != "ADMIN":
            block = seed_sql.split(f"-- {role}\n", 1)[1].split(f"WHERE r.nombre = '{role}'", 1)[0]
            assert set(re.findall(r"'([a-z_.]+)'", block)) == set(codes)


def test_seed_script_runs_on_mysql(mysql_engine: Engine):
    from tests.conftest import truncate_all

    truncate_all(mysql_engine)
    with mysql_engine.begin() as conn:
        run_script(conn, SEED_DATA)
        run_script(conn, SEED_DATA)  # idempotent
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM permissions").scalar() == len(PERMISSION_CATALOG)
        admin_perms = conn.exec_driver_sql(
            "SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.nombre = 'ADMIN'"
        ).scalar()
        assert admin_perms == len(PERMISSION_CATALOG)
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM users WHERE email = 'admin@example.com'").scalar() == 1
    truncate_all(mysql_engine)


def test_seed_fills_system_roles_without_permissions(app, uow, settings):
    from app.infrastructure.database.seed import seed

    with uow.transaction():
        uow.roles.get_by_nombre("VENDEDOR").set_permissions([])
    seed(app.state.session_factory(), settings, app.state.password_hasher)
    uow.rollback()
    codes = {p.codigo for p in uow.roles.get_by_nombre("VENDEDOR").permissions}
    assert codes == set(DEFAULT_ROLES["VENDEDOR"])


def test_upgrade_002_migrates_a_v1_database(mysql_engine: Engine):
    """Recreates the v1 schema with old-style data, applies upgrade 002 and checks the result."""
    from pathlib import Path

    from app.infrastructure.database.sql_scripts import UPGRADE_002

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, initial)
            conn.exec_driver_sql("INSERT INTO permissions (codigo) VALUES ('products.view'), ('sales.view'), ('sales.create'), ('users.view')")
            conn.exec_driver_sql("INSERT INTO roles (nombre) VALUES ('ADMIN'), ('USUARIO'), ('TECNICO')")
            conn.exec_driver_sql(
                "INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.nombre = 'USUARIO'"
            )
            conn.exec_driver_sql(
                "INSERT INTO users (nombre, apellido, email, password, tipo_usuario, rol_id) VALUES "
                "('A','A','a@x.com','h','ADMIN',(SELECT id FROM roles WHERE nombre='ADMIN')),"
                "('V','V','v@x.com','h','USUARIO',(SELECT id FROM roles WHERE nombre='USUARIO')),"
                "('T','T','t@x.com','h','TECNICO',NULL),"
                "('C','C','c@x.com',NULL,'CLIENTE',NULL)"
            )
            conn.exec_driver_sql("INSERT INTO categories (nombre) VALUES ('Cat')")
            conn.exec_driver_sql("INSERT INTO products (category_id, nombre, precio, stock) VALUES (1, 'Pantalla', 25.50, 4)")
            conn.exec_driver_sql("INSERT INTO sales (user_id, total, estado) VALUES (2, 25.50, 'CONFIRMADA')")

        with mysql_engine.begin() as conn:
            run_script(conn, UPGRADE_002)

        with mysql_engine.connect() as conn:
            users = conn.exec_driver_sql(
                "SELECT u.email, r.nombre FROM users u JOIN roles r ON r.id = u.rol_id ORDER BY u.id"
            ).all()
            assert [tuple(u) for u in users] == [
                ("a@x.com", "ADMIN"), ("v@x.com", "VENDEDOR"), ("t@x.com", "TECNICO"), ("c@x.com", "CLIENTE")
            ]
            vendedor = conn.exec_driver_sql(
                "SELECT p.codigo FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                "JOIN permissions p ON p.id = rp.permission_id WHERE r.nombre = 'VENDEDOR'"
            ).scalars().all()
            assert set(vendedor) == {"products.view", "sales.view", "sales.create"}
            product = conn.exec_driver_sql("SELECT sku, precio_venta, precio_mayor FROM products").one()
            assert product[0] == "SKU-000001" and product[1] == product[2]
            assert tuple(conn.exec_driver_sql("SELECT factura, cliente_id FROM sales").one()) == (0, None)
            columns = conn.exec_driver_sql(
                "SELECT COLUMN_NAME FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = 'users'"
            ).scalars().all()
            assert "tipo_usuario" not in columns and "identificacion" in columns
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)
