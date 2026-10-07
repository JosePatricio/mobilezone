"""permiso para eliminar órdenes de trabajo

Runs db_scripts/upgrades/011_eliminar_ordenes.sql.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-07

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_011, run_script

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_011)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
