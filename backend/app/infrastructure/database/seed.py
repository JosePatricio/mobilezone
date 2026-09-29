"""Idempotent seed: permission catalog, default roles and the initial admin user.

Usage (from the ``backend`` folder, after ``alembic upgrade head``)::

    python -m app.infrastructure.database.seed
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.application.services.security import PasswordHasher
from app.domain.entities import Permission, Role, User
from app.domain.value_objects.enums import UserType
from app.domain.value_objects.permissions import DEFAULT_ROLES, PERMISSION_CATALOG
from app.infrastructure.config.settings import Settings, get_settings
from app.infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork


def seed(session: Session, settings: Settings, hasher: PasswordHasher) -> None:
    uow = SqlAlchemyUnitOfWork(session)
    with uow.transaction():
        existing = {p.codigo: p for p in uow.permissions.list_all()}
        for codigo, descripcion in PERMISSION_CATALOG.items():
            if codigo in existing:
                existing[codigo].descripcion = descripcion
            else:
                existing[codigo] = Permission(codigo=codigo, descripcion=descripcion)
                session.add(existing[codigo])
        uow.flush()

        for nombre, codes in DEFAULT_ROLES.items():
            role = uow.roles.get_by_nombre(nombre)
            if role is None:
                role = Role(nombre=nombre, descripcion=f"Rol {nombre.lower()} (por defecto)")
                uow.roles.add(role)
                role.set_permissions([existing[c] for c in codes])
            elif nombre == "ADMIN":
                # Keep the admin role complete when new permissions are added to the catalog.
                role.set_permissions([existing[c] for c in codes])
        uow.flush()

        if uow.users.get_by_email(settings.admin_email) is None:
            admin_role = uow.roles.get_by_nombre("ADMIN")
            uow.users.add(
                User(
                    nombre=settings.admin_nombre,
                    apellido=settings.admin_apellido,
                    email=settings.admin_email,
                    tipo_usuario=UserType.ADMIN,
                    password=hasher.hash(settings.admin_password),
                    rol_id=admin_role.id if admin_role else None,
                )
            )


def main() -> None:
    from app.infrastructure.database.session import build_engine, build_session_factory
    from app.infrastructure.security.passwords import BcryptPasswordHasher

    settings = get_settings()
    engine = build_engine(settings.database_url, settings.database_echo)
    session = build_session_factory(engine)()
    try:
        seed(session, settings, BcryptPasswordHasher(settings.bcrypt_rounds))
    finally:
        session.close()
    print(f"Seed completado. Administrador: {settings.admin_email}")


if __name__ == "__main__":
    main()
