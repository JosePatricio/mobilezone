"""Propaganda por la API de WhatsApp (campañas, estados, bajas)

Runs db_scripts/upgrades/024_whatsapp_api.sql.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-14

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_024, run_script

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_024)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
