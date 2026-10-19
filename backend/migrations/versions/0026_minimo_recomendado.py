"""Mínimo recomendado de stock de los productos (alerta en el dashboard)

Runs db_scripts/upgrades/026_minimo_recomendado.sql.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-19

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_026, run_script

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_026)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
