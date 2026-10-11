"""apertura de caja diaria (sucursal y efectivo inicial del vendedor)

Runs db_scripts/upgrades/018_apertura_caja.sql.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-10

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_018, run_script

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_018)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
