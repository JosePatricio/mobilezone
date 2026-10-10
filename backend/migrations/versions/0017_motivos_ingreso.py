"""varios motivos de ingreso por orden de trabajo

Runs db_scripts/upgrades/017_motivos_ingreso.sql.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-09

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_017, run_script

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_017)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
