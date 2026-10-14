"""módulo Propaganda (permiso marketing.manage)

Runs db_scripts/upgrades/023_propaganda.sql.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-14

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_023, run_script

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_023)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
