from __future__ import annotations

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.infrastructure.database.tables import start_mappers


def build_engine(database_url: str, echo: bool = False) -> Engine:
    """MySQL engine (mysql+pymysql://...).

    ``pool_pre_ping`` and ``pool_recycle`` avoid "MySQL server has gone away"
    errors on connections closed by the server's ``wait_timeout``.
    """
    return create_engine(database_url, echo=echo, pool_pre_ping=True, pool_recycle=1800)


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    start_mappers()
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=True)
