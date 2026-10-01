"""pagos de ventas (método, recargo tarjeta, vuelto) y permisos (branches.any, sales.update)

Runs db_scripts/upgrades/004_pagos_permisos.sql.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-30

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_004, run_script

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_004)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
