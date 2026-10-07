"""imagen de los repuestos de afiliados

Runs db_scripts/upgrades/013_imagen_repuesto_afiliado.sql.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-07

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_013, run_script

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_013)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
