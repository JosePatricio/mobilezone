"""órdenes: tiempo de garantía en días, fecha de entrega, técnico = usuario que registra; permisos del vendedor

Runs db_scripts/upgrades/006_ordenes_vendedor.sql.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-01

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_006, run_script

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_006)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
