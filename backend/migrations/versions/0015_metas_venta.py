"""metas de venta (tabla settings) y se quita vaciar datos

Runs db_scripts/upgrades/015_metas_venta.sql.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-08

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_015, run_script

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_015)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
