"""repuestos de afiliados, dirección del usuario y contador de visitas

Runs db_scripts/upgrades/009_repuestos_afiliados.sql.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-06

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_009, run_script

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_009)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
