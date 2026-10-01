"""órdenes de trabajo: motivo de ingreso, garantía, bloqueo, código público (QR), fotos; email opcional

Runs db_scripts/upgrades/005_ordenes_trabajo.sql.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-01

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_005, run_script

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_005)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
