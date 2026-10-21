"""Promoción: vista previa de las campañas de WhatsApp (y lista de campañas desde cero)

Runs db_scripts/upgrades/027_vista_previa_promocion.sql.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-21

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_027, run_script

revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_027)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
