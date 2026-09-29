"""initial schema (MySQL)

Applies db_scripts/02_create_tables.sql so the SQL scripts are the single
source of the schema. Later revisions should use regular Alembic operations
and the change must also be reflected in the db_scripts folder.

Revision ID: 0001
Revises:
Create Date: 2026-09-29

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import CREATE_TABLES, DROP_TABLES, run_script

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), CREATE_TABLES)


def downgrade() -> None:
    run_script(op.get_bind(), DROP_TABLES)
