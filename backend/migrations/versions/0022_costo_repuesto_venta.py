"""costo de repuesto en la venta de la orden finalizada

Runs db_scripts/upgrades/022_costo_repuesto_venta.sql.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_022, run_script

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_022)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
