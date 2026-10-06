"""Idempotent seed: permission catalog, default roles and the initial admin user.

Usage (from the ``backend`` folder, after ``alembic upgrade head``)::

    python -m app.infrastructure.database.seed
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.application.services.security import PasswordHasher
from app.domain.entities import Branch, Permission, Role, User
from app.domain.value_objects.pagination import PageRequest
from app.domain.value_objects.permissions import DEFAULT_ROLES, PERMISSION_CATALOG
from app.infrastructure.config.settings import Settings, get_settings
from app.infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork

DEFAULT_BRANCH = "Matriz"

# Additional administrators always present. Only the bcrypt hash is kept in the code; the user
# is created once (a later password change is never overwritten).
DEFAULT_ADMINS: list[dict[str, str]] = [
    {
        "nombre": "Jose David",
        "apellido": "Administrador",
        "email": "josedavidip89@gmail.com",
        "password_hash": "$2b$12$btCMZmr6ZjbsS7tLmhTdAuQD.69Qe.Nrh1RCGlip41CDQ2IXkehf.",
    },
]


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
        # Permissions removed from the catalog (e.g. products.stock, replaced by inventory.manage).
        for codigo in [c for c in existing if c not in PERMISSION_CATALOG]:
            session.delete(existing.pop(codigo))
        uow.flush()

        for nombre, codes in DEFAULT_ROLES.items():
            role = uow.roles.get_by_nombre(nombre)
            if role is None:
                role = Role(nombre=nombre, descripcion=f"Rol {nombre.lower()} (por defecto)")
                uow.roles.add(role)
                role.set_permissions([existing[c] for c in codes])
            elif nombre == "ADMIN" or not role.permissions:
                # ADMIN is kept complete when the catalog grows; a system role without
                # permissions (e.g. created empty by an upgrade script) gets its defaults.
                role.set_permissions([existing[c] for c in codes])
        uow.flush()

        # Stock is kept per branch: make sure at least one branch exists.
        if uow.branches.list(PageRequest(1, 1)).total == 0:
            uow.branches.add(Branch(nombre=DEFAULT_BRANCH, ubicacion="Por definir"))

        admin_role = uow.roles.get_by_nombre("ADMIN")
        if uow.users.get_by_email(settings.admin_email) is None:
            uow.users.add(
                User(
                    nombre=settings.admin_nombre,
                    apellido=settings.admin_apellido,
                    email=settings.admin_email,
                    password=hasher.hash(settings.admin_password),
                    rol_id=admin_role.id if admin_role else None,
                )
            )
        for admin in DEFAULT_ADMINS:
            if uow.users.get_by_email(admin["email"]) is None:
                uow.users.add(
                    User(
                        nombre=admin["nombre"],
                        apellido=admin["apellido"],
                        email=admin["email"],
                        password=admin["password_hash"],
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
