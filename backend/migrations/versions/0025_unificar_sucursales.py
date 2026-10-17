"""Sucursal Centro unificada en Matriz (sin perder datos)

Runs db_scripts/upgrades/025_unificar_sucursales.sql.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-17

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_025, run_script

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_025)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
