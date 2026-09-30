"""sucursales, inventario por sucursal, provincia de usuarios

Runs db_scripts/upgrades/003_sucursales_inventario.sql.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-30

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_003, run_script

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_003)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
