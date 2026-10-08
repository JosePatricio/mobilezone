"""fecha y hora de ingreso de las órdenes de trabajo

Runs db_scripts/upgrades/016_fecha_hora_orden.sql.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-08

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_016, run_script

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_016)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
