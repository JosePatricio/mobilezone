"""Propaganda → Ruleta: ruletas de premios y enlaces de un solo uso en las campañas

Runs db_scripts/upgrades/028_ruleta.sql.

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-22

"""
from typing import Sequence, Union

from alembic import op

from app.infrastructure.database.sql_scripts import UPGRADE_028, run_script

revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    run_script(op.get_bind(), UPGRADE_028)


def downgrade() -> None:
    raise NotImplementedError("Irreversible: restore the database backup taken before the upgrade.")
