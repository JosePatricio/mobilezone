"""initial schema (MySQL)

Applies migrations/sql/0001_initial_schema.sql: a frozen copy of the original
db_scripts/02_create_tables.sql (that file always holds the *current* full schema
for new installations; each later revision runs its db_scripts/upgrades script).

Revision ID: 0001
Revises:
Create Date: 2026-09-29

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import DROP_TABLES, run_script

INITIAL_SCHEMA = Path(__file__).resolve().parents[1] / "sql" / "0001_initial_schema.sql"

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), INITIAL_SCHEMA)


def downgrade() -> None:
    run_script(op.get_bind(), DROP_TABLES)
