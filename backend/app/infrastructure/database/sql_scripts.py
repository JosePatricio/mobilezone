"""Access to the MySQL scripts in ``backend/db_scripts`` (single source of the schema DDL)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import Connection, text

DB_SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "db_scripts"

CREATE_TABLES = "02_create_tables.sql"
SEED_DATA = "03_seed_data.sql"
DROP_TABLES = "99_drop_tables.sql"
UPGRADE_002 = "upgrades/002_productos_usuarios_ventas.sql"
UPGRADE_003 = "upgrades/003_sucursales_inventario.sql"
UPGRADE_004 = "upgrades/004_pagos_permisos.sql"
UPGRADE_005 = "upgrades/005_ordenes_trabajo.sql"
UPGRADE_006 = "upgrades/006_ordenes_vendedor.sql"
UPGRADE_007 = "upgrades/007_modelo_tecnico.sql"


def read_statements(script: str | Path) -> list[str]:
    """Split a script into statements. Scripts contain no procedures, so ';' at line end ends a statement.

    ``script`` is a path relative to ``db_scripts`` or an absolute ``Path``.
    """
    path = script if isinstance(script, Path) else DB_SCRIPTS_DIR / script
    lines = [
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("--")
    ]
    statements, current = [], []
    for line in lines:
        current.append(line)
        if line.rstrip().endswith(";"):
            statements.append("\n".join(current).rstrip().rstrip(";"))
            current = []
    if current:
        statements.append("\n".join(current))
    return statements


def run_script(connection: Connection, script: str | Path) -> None:
    for statement in read_statements(script):
        if statement.strip().upper() in ("START TRANSACTION", "COMMIT"):
            continue  # the caller controls the transaction
        # exec_driver_sql: no bind-parameter parsing (bcrypt hashes contain ':' and '$').
        # "format" drivers (PyMySQL) still interpolate '%', so literal percent signs are escaped.
        if connection.dialect.paramstyle in ("format", "pyformat"):
            statement = statement.replace("%", "%%")
        connection.exec_driver_sql(statement)


def table_exists(connection: Connection, name: str) -> bool:
    query = text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :n")
    return bool(connection.execute(query, {"n": name}).scalar())
