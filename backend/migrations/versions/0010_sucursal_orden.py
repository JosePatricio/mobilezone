"""sucursal de cada orden de trabajo y dirección de la sucursal

Runs db_scripts/upgrades/010_sucursal_orden.sql.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-06

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_010, run_script

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_010)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
