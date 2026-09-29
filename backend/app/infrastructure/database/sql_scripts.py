"""Access to the MySQL scripts in ``backend/db_scripts`` (single source of the schema DDL)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import Connection, text

DB_SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "db_scripts"

CREATE_TABLES = "02_create_tables.sql"
SEED_DATA = "03_seed_data.sql"
DROP_TABLES = "99_drop_tables.sql"


def read_statements(filename: str) -> list[str]:
    """Split a script into statements. Scripts contain no procedures, so ';' at line end ends a statement."""
    lines = [
        line
        for line in (DB_SCRIPTS_DIR / filename).read_text(encoding="utf-8").splitlines()
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


def run_script(connection: Connection, filename: str) -> None:
    for statement in read_statements(filename):
        if statement.strip().upper() in ("START TRANSACTION", "COMMIT"):
            continue  # the caller controls the transaction
        # exec_driver_sql: no bind-parameter parsing (bcrypt hashes contain ':' and '$').
        connection.exec_driver_sql(statement)


def table_exists(connection: Connection, name: str) -> bool:
    query = text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :n")
    return bool(connection.execute(query, {"n": name}).scalar())
