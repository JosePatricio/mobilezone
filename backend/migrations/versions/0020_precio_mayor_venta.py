"""precio al por mayor en las líneas de venta

Runs db_scripts/upgrades/020_precio_mayor_venta.sql.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-12

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_020, run_script

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_020)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
