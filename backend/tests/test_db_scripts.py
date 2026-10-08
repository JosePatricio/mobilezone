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


def test_upgrade_003_moves_stock_to_branches(mysql_engine: Engine):
    """v2 database (0001 + upgrade 002) with data → upgrade 003: stock, sales and sellers go to Matriz."""
    from pathlib import Path

    from app.infrastructure.database.sql_scripts import UPGRADE_002, UPGRADE_003

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, initial)
            run_script(conn, UPGRADE_002)
            conn.exec_driver_sql("INSERT INTO permissions (codigo) VALUES ('products.view'), ('products.stock')")
            conn.exec_driver_sql(
                "INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
                "WHERE r.nombre IN ('ADMIN', 'VENDEDOR')"
            )
            conn.exec_driver_sql(
                "INSERT INTO users (nombre, apellido, email, password, rol_id) VALUES "
                "('V','V','v@x.com','h',(SELECT id FROM roles WHERE nombre='VENDEDOR'))"
            )
            conn.exec_driver_sql("INSERT INTO categories (nombre) VALUES ('Cat')")
            conn.exec_driver_sql(
                "INSERT INTO products (category_id, sku, nombre, precio_venta, precio_costo, precio_mayor, stock) "
                "VALUES (1, 'A1', 'Pantalla', 10, 5, 8, 7)"
            )
            conn.exec_driver_sql("INSERT INTO sales (user_id, total, estado) VALUES (1, 10, 'CONFIRMADA')")
            conn.exec_driver_sql(
                "INSERT INTO sale_details (sale_id, product_id, cantidad, precio_unitario, subtotal) VALUES (1, 1, 1, 10, 10)"
            )
            conn.exec_driver_sql(
                "INSERT INTO stock_movements (product_id, tipo, cantidad, stock_resultante) VALUES (1, 'VENTA', -1, 7)"
            )

        with mysql_engine.begin() as conn:
            run_script(conn, UPGRADE_003)

        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            assert q("SELECT nombre FROM branches").scalars().all() == ["Matriz"]
            assert tuple(q("SELECT product_id, stock FROM inventory").one()) == (1, 7)
            inv_id = q("SELECT id FROM inventory").scalar()
            assert q("SELECT inventory_id FROM sale_details").scalar() == inv_id
            assert q("SELECT inventory_id FROM stock_movements").scalar() == inv_id
            assert q("SELECT b.nombre FROM sales s JOIN branches b ON b.id = s.branch_id").scalar() == "Matriz"
            assert q("SELECT COUNT(*) FROM user_branches").scalar() == 1  # the seller
            assert q("SELECT COUNT(*) FROM permissions WHERE codigo = 'products.stock'").scalar() == 0
            vendedor = q(
                "SELECT p.codigo FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                "JOIN permissions p ON p.id = rp.permission_id WHERE r.nombre = 'VENDEDOR'"
            ).scalars().all()
            assert "inventory.view" in vendedor
            columns = q(
                "SELECT COLUMN_NAME FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = 'products'"
            ).scalars().all()
            assert "stock" not in columns
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_004_adds_payments_and_renames_permission(mysql_engine: Engine):
    """v3 database (0001 + 002 + 003) with a sale → upgrade 004."""
    from pathlib import Path

    from app.infrastructure.database.sql_scripts import UPGRADE_002, UPGRADE_003, UPGRADE_004

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, initial)
            run_script(conn, UPGRADE_002)
            run_script(conn, UPGRADE_003)
            conn.exec_driver_sql("INSERT INTO permissions (codigo) VALUES ('products.view')")  # 003 added sales.any_branch
            conn.exec_driver_sql(
                "INSERT IGNORE INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
                "WHERE r.nombre IN ('ADMIN', 'VENDEDOR')"
            )
            conn.exec_driver_sql(
                "INSERT INTO users (nombre, apellido, email, password, rol_id) VALUES "
                "('V','V','v@x.com','h',(SELECT id FROM roles WHERE nombre='VENDEDOR'))"
            )
            conn.exec_driver_sql(
                "INSERT INTO sales (user_id, branch_id, total, estado) VALUES (1, (SELECT id FROM branches), 12.5, 'CONFIRMADA')"
            )

        with mysql_engine.begin() as conn:
            run_script(conn, UPGRADE_004)

        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            row = q("SELECT metodo_pago, recargo, total_pagar, monto_recibido, cambio FROM sales").one()
            assert row[0] is None and float(row[1]) == 0 and float(row[2]) == 12.5 and row[3] is None and row[4] is None
            assert q("SELECT COUNT(*) FROM permissions WHERE codigo = 'sales.any_branch'").scalar() == 0
            assert q("SELECT COUNT(*) FROM permissions WHERE codigo = 'branches.any'").scalar() == 1
            vendedor = set(
                q(
                    "SELECT p.codigo FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                    "JOIN permissions p ON p.id = rp.permission_id WHERE r.nombre = 'VENDEDOR'"
                ).scalars()
            )
            assert {"inventory.manage", "sales.update"} <= vendedor
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_005_work_orders_and_optional_email(mysql_engine: Engine):
    """v4 database (0001 + 002 + 003 + 004) with work orders → upgrade 005."""
    from pathlib import Path

    from app.infrastructure.database.sql_scripts import UPGRADE_002, UPGRADE_003, UPGRADE_004, UPGRADE_005

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in (initial, UPGRADE_002, UPGRADE_003, UPGRADE_004):
                run_script(conn, script)
            q = conn.exec_driver_sql
            q(
                "INSERT INTO users (nombre, apellido, email, password, rol_id) VALUES "
                "('A','A','a@x.com','h',(SELECT id FROM roles WHERE nombre='ADMIN'))"
            )
            q("INSERT INTO brands (nombre) VALUES ('Samsung')")
            q("INSERT INTO models (brand_id, nombre) VALUES ((SELECT id FROM brands), 'A10')")
            for garantia in (1, 0):
                q(
                    "INSERT INTO work_orders (user_id, cliente_id, marca_id, modelo_id, estado, garantia, "
                    "presupuesto, anticipo, saldo, fecha) VALUES (1, 1, (SELECT id FROM brands), "
                    f"(SELECT id FROM models), 0, {garantia}, 10, 0, 10, '2026-09-01')"
                )

        with mysql_engine.begin() as conn:
            run_script(conn, UPGRADE_005)

        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            rows = q(
                "SELECT tipo_garantia, motivo_ingreso, bloqueo_tipo, codigo_publico FROM work_orders ORDER BY id"
            ).all()
            assert [r[0] for r in rows] == ["GARANTIA_LOCAL", "SIN_GARANTIA"]
            assert all(r[1] == "OTROS" and r[2] == "NINGUNO" and len(r[3]) == 24 for r in rows)
            assert rows[0][3] != rows[1][3]
            columns = set(q("SHOW COLUMNS FROM work_orders").scalars())
            assert "garantia" not in columns
            assert q("SELECT COUNT(*) FROM work_order_photos").scalar() == 0
            nullable = q("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                         "AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'").scalar()
            assert nullable == "YES"
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_006_warranty_days_and_seller_permissions(mysql_engine: Engine):
    """v5 database (0001 + 002..005) with work orders and a configured VENDEDOR role → upgrade 006."""
    from pathlib import Path

    from app.infrastructure.database.sql_scripts import (
        UPGRADE_002,
        UPGRADE_003,
        UPGRADE_004,
        UPGRADE_005,
        UPGRADE_006,
    )

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in (initial, UPGRADE_002, UPGRADE_003, UPGRADE_004, UPGRADE_005):
                run_script(conn, script)
            q = conn.exec_driver_sql
            for code in ("sales.view", "work_orders.view", "work_orders.assign_technician", "brands.view", "models.create"):
                q(f"INSERT IGNORE INTO permissions (codigo) VALUES ('{code}')")
            q(
                "INSERT INTO role_permissions SELECT r.id, p.id FROM roles r JOIN permissions p "
                "ON p.codigo IN ('sales.view', 'work_orders.assign_technician') WHERE r.nombre IN ('VENDEDOR', 'ADMIN')"
            )
            q(
                "INSERT INTO users (nombre, apellido, email, password, rol_id) VALUES "
                "('A','A','a@x.com','h',(SELECT id FROM roles WHERE nombre='ADMIN'))"
            )
            q("INSERT INTO brands (nombre) VALUES ('Samsung')")
            q("INSERT INTO models (brand_id, nombre) VALUES ((SELECT id FROM brands), 'A10')")
            for n, garantia in enumerate(("GARANTIA_FABRICA", "SIN_GARANTIA")):
                q(
                    "INSERT INTO work_orders (user_id, cliente_id, marca_id, modelo_id, estado, motivo_ingreso, "
                    "tipo_garantia, codigo_publico, presupuesto, anticipo, saldo, fecha) VALUES (1, 1, "
                    f"(SELECT id FROM brands), (SELECT id FROM models), 0, 'OTROS', '{garantia}', 'c{n}', 10, 0, 10, '2026-09-01')"
                )

        with mysql_engine.begin() as conn:
            run_script(conn, UPGRADE_006)

        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            assert [r[0] for r in q("SELECT garantia_dias FROM work_orders ORDER BY id")] == [30, 0]
            columns = set(q("SHOW COLUMNS FROM work_orders").scalars())
            assert "fecha_entrega" in columns and "tipo_garantia" not in columns
            assert q("SELECT COUNT(*) FROM permissions WHERE codigo = 'work_orders.assign_technician'").scalar() == 0
            vendedor = set(
                q(
                    "SELECT p.codigo FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                    "JOIN permissions p ON p.id = rp.permission_id WHERE r.nombre = 'VENDEDOR'"
                ).scalars()
            )
            assert {"sales.view", "work_orders.view", "brands.view", "models.create"} <= vendedor
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_007_adds_technical_model(mysql_engine: Engine):
    """v6 database (0001 + 002..006) → upgrade 007."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in (initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004, sql.UPGRADE_005, sql.UPGRADE_006):
                run_script(conn, script)
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_007)
        with mysql_engine.connect() as conn:
            assert "modelo_tecnico" in set(conn.exec_driver_sql("SHOW COLUMNS FROM work_orders").scalars())
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_008_status_history_and_order_sales(mysql_engine: Engine):
    """v7 database (0001 + 002..007) with an order without technician -> upgrade 008."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    scripts = (initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004, sql.UPGRADE_005, sql.UPGRADE_006, sql.UPGRADE_007)
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in scripts:
                run_script(conn, script)
            q = conn.exec_driver_sql
            q(
                "INSERT INTO users (nombre, apellido, email, password, rol_id) VALUES "
                "('A','A','a@x.com','h',(SELECT id FROM roles WHERE nombre='ADMIN'))"
            )
            q("INSERT INTO brands (nombre) VALUES ('Samsung')")
            q("INSERT INTO models (brand_id, nombre) VALUES ((SELECT id FROM brands), 'A10')")
            q(
                "INSERT INTO work_orders (user_id, cliente_id, marca_id, modelo_id, estado, motivo_ingreso, "
                "codigo_publico, presupuesto, anticipo, saldo, fecha) VALUES (1, 1, (SELECT id FROM brands), "
                "(SELECT id FROM models), 1, 'OTROS', 'c1', 10, 0, 10, '2026-09-01')"
            )
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_008)
        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            assert q("SELECT tecnico_id FROM work_orders").scalar() == 1
            assert tuple(q("SELECT estado, user_id FROM work_order_status_changes").one()) == (1, 1)
            assert "work_order_id" in set(q("SHOW COLUMNS FROM sales").scalars())
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_009_affiliate_parts_address_and_permissions(mysql_engine: Engine):
    """v8 database (0001 + 002..008) with a configured TECNICO role -> upgrade 009."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    scripts = (
        initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004,
        sql.UPGRADE_005, sql.UPGRADE_006, sql.UPGRADE_007, sql.UPGRADE_008,
    )
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in scripts:
                run_script(conn, script)
            q = conn.exec_driver_sql
            q("INSERT IGNORE INTO roles (nombre) VALUES ('ADMIN'), ('TECNICO')")
            q("INSERT IGNORE INTO permissions (codigo) VALUES ('work_orders.view')")
            q(
                "INSERT IGNORE INTO role_permissions (role_id, permission_id) "
                "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p"
            )
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_009)
        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            assert "direccion" in set(q("SHOW COLUMNS FROM users").scalars())
            assert {"affiliate_parts", "page_visits"} <= set(q("SHOW TABLES").scalars())
            granted = q(
                "SELECT r.nombre, p.codigo FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                "JOIN permissions p ON p.id = rp.permission_id WHERE p.codigo LIKE 'affiliate%%'"
            ).all()
            assert sorted(map(tuple, granted)) == [
                ("ADMIN", "affiliate_parts.any"),
                ("ADMIN", "affiliate_parts.manage"),
                ("TECNICO", "affiliate_parts.manage"),
            ]
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_010_branch_address_and_order_branch(mysql_engine: Engine):
    """v9 database (0001 + 002..009) with an order of a seller of the second branch -> upgrade 010."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    scripts = (
        initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004, sql.UPGRADE_005,
        sql.UPGRADE_006, sql.UPGRADE_007, sql.UPGRADE_008, sql.UPGRADE_009,
    )
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in scripts:
                run_script(conn, script)
            q = conn.exec_driver_sql
            q("INSERT IGNORE INTO roles (nombre) VALUES ('ADMIN')")
            q("INSERT INTO branches (nombre, ubicacion) VALUES ('Norte', 'x')")
            norte = q("SELECT id FROM branches WHERE nombre = 'Norte'").scalar()
            q(
                "INSERT INTO users (nombre, apellido, email, password, rol_id) VALUES "
                "('A','A','a@x.com','h',(SELECT id FROM roles WHERE nombre='ADMIN'))"
            )
            user = q("SELECT id FROM users WHERE email = 'a@x.com'").scalar()
            q(f"INSERT INTO user_branches (user_id, branch_id) VALUES ({user}, {norte})")
            q("INSERT INTO brands (nombre) VALUES ('Samsung')")
            q("INSERT INTO models (brand_id, nombre) VALUES ((SELECT id FROM brands), 'A10')")
            q(
                "INSERT INTO work_orders (user_id, cliente_id, marca_id, modelo_id, estado, motivo_ingreso, "
                f"codigo_publico, presupuesto, anticipo, saldo, fecha) VALUES ({user}, {user}, (SELECT id FROM brands), "
                "(SELECT id FROM models), 0, 'OTROS', 'c1', 10, 0, 10, '2026-09-01')"
            )
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_010)
        with mysql_engine.connect() as conn:
            q = conn.exec_driver_sql
            assert "direccion" in set(q("SHOW COLUMNS FROM branches").scalars())
            assert q("SELECT branch_id FROM work_orders").scalar() == norte
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_011_delete_permission_for_admin(mysql_engine: Engine):
    """v10 database with the ADMIN role -> upgrade 011 grants work_orders.delete."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    scripts = (
        initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004, sql.UPGRADE_005,
        sql.UPGRADE_006, sql.UPGRADE_007, sql.UPGRADE_008, sql.UPGRADE_009, sql.UPGRADE_010,
    )
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in scripts:
                run_script(conn, script)
            conn.exec_driver_sql("INSERT IGNORE INTO roles (nombre) VALUES ('ADMIN'), ('VENDEDOR')")
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_011)
        with mysql_engine.connect() as conn:
            granted = conn.exec_driver_sql(
                "SELECT r.nombre FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                "JOIN permissions p ON p.id = rp.permission_id WHERE p.codigo = 'work_orders.delete'"
            ).scalars().all()
            assert granted == ["ADMIN"]
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_012_technician_keeps_only_affiliate_parts(mysql_engine: Engine):
    """v11 database with a TECNICO role holding order permissions -> upgrade 012."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    scripts = (
        initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004, sql.UPGRADE_005, sql.UPGRADE_006,
        sql.UPGRADE_007, sql.UPGRADE_008, sql.UPGRADE_009, sql.UPGRADE_010, sql.UPGRADE_011,
    )
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in scripts:
                run_script(conn, script)
            q = conn.exec_driver_sql
            q("INSERT IGNORE INTO roles (nombre) VALUES ('TECNICO'), ('VENDEDOR')")
            q("INSERT IGNORE INTO permissions (codigo) VALUES ('work_orders.view'), ('products.view')")
            q(
                "INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r "
                "JOIN permissions p ON p.codigo IN ('work_orders.view', 'products.view') "
                "WHERE r.nombre IN ('TECNICO', 'VENDEDOR')"
            )
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_012)
        with mysql_engine.connect() as conn:
            def codes(role: str) -> list[str]:
                return sorted(conn.exec_driver_sql(
                    "SELECT p.codigo FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                    f"JOIN permissions p ON p.id = rp.permission_id WHERE r.nombre = '{role}'"
                ).scalars())

            assert codes("TECNICO") == ["affiliate_parts.manage"]
            assert codes("VENDEDOR") == ["products.view", "work_orders.view"]  # other roles untouched
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)


def test_upgrade_014_delete_users_permission_for_admin(mysql_engine: Engine):
    """v13 database with the ADMIN role -> upgrade 014 grants users.delete."""
    from pathlib import Path

    from app.infrastructure.database import sql_scripts as sql

    initial = Path(__file__).resolve().parents[1] / "migrations" / "sql" / "0001_initial_schema.sql"
    scripts = (
        initial, sql.UPGRADE_002, sql.UPGRADE_003, sql.UPGRADE_004, sql.UPGRADE_005, sql.UPGRADE_006, sql.UPGRADE_007,
        sql.UPGRADE_008, sql.UPGRADE_009, sql.UPGRADE_010, sql.UPGRADE_011, sql.UPGRADE_012, sql.UPGRADE_013,
    )
    try:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            for script in scripts:
                run_script(conn, script)
            conn.exec_driver_sql("INSERT IGNORE INTO roles (nombre) VALUES ('ADMIN'), ('VENDEDOR')")
        with mysql_engine.begin() as conn:
            run_script(conn, sql.UPGRADE_014)
        with mysql_engine.connect() as conn:
            granted = conn.exec_driver_sql(
                "SELECT r.nombre FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
                "JOIN permissions p ON p.id = rp.permission_id WHERE p.codigo = 'users.delete'"
            ).scalars().all()
            assert granted == ["ADMIN"]
    finally:
        with mysql_engine.begin() as conn:
            run_script(conn, DROP_TABLES)
            run_script(conn, CREATE_TABLES)
