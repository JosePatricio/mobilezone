"""rol técnico: solo repuestos de afiliados

Runs db_scripts/upgrades/012_tecnico_afiliado.sql.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-07

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_012, run_script

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_012)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
