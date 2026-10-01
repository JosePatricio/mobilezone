"""órdenes: historial de estados y venta al finalizar

Runs db_scripts/upgrades/008_estados_venta_orden.sql.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-01

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_008, run_script

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_008)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
