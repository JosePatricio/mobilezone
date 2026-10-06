"""SQLAlchemy implementations of the domain repositories."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Generic, TypeVar

from sqlalchemy import Select, and_, delete, func, or_, select, text
from sqlalchemy.orm import Session

from app.domain import repositories as ports
from app.domain.entities import (
    Branch,
    Brand,
    Category,
    DeviceModel,
    Inventory,
    Permission,
    Product,
    Role,
    Sale,
    SparePart,
    StockMovement,
    User,
    WorkOrder,
)
from app.domain.value_objects.enums import SaleStatus
from app.domain.value_objects.pagination import Page, PageRequest
from app.infrastructure.database.tables import (
    branches_table,
    brands_table,
    categories_table,
    inventory_table,
    models_table,
    permissions_table,
    products_table,
    roles_table,
    sale_details_table,
    sales_table,
    spare_parts_table,
    stock_movements_table,
    users_table,
    work_order_photos_table,
    work_order_spare_parts_table,
    work_order_status_changes_table,
    work_orders_table,
)

T = TypeVar("T")


def _like(value: str) -> str:
    escaped = value.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _utc_naive(value: datetime) -> datetime:
    """Datetimes are stored as naive UTC."""
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


class SqlAlchemyRepository(Generic[T]):
    entity: type

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, entity: T) -> T:
        self.session.add(entity)
        return entity

    def get(self, entity_id: int) -> T | None:
        return self.session.get(self.entity, entity_id)

    def delete(self, entity: T) -> None:
        self.session.delete(entity)

    def _paginate(self, stmt: Select, page: PageRequest) -> Page[T]:
        total = self.session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
        items = list(self.session.scalars(stmt.limit(page.size).offset(page.offset)).unique())
        return Page(items=items, total=total, page=page.page, size=page.size)


class SqlAlchemyUserRepository(SqlAlchemyRepository[User], ports.UserRepository):
    entity = User

    def get_by_email(self, email: str) -> User | None:
        return self.session.scalars(select(User).where(func.lower(users_table.c.email) == email.lower())).first()

    def get_by_identificacion(self, identificacion: str) -> User | None:
        return self.session.scalars(select(User).where(users_table.c.identificacion == identificacion)).first()

    def find_same_person(self, identificacion: str) -> list[User]:
        c = users_table.c
        conditions = [c.identificacion == identificacion]
        if len(identificacion) == 10:  # cédula → RUC of the same natural person
            conditions.append(
                and_(
                    func.length(c.identificacion) == 13,
                    func.substr(c.identificacion, 1, 10) == identificacion,
                )
            )
        elif len(identificacion) == 13 and identificacion[2] in "012345":  # natural-person RUC → cédula
            conditions.append(c.identificacion == identificacion[:10])
        return list(self.session.scalars(select(User).where(or_(*conditions))))

    def list(self, page, *, search=None, roles: list[str] | None = None, estado=None, rol_id=None):
        c = users_table.c
        stmt = select(User)
        if search:
            pattern = _like(search)
            full_name = func.lower(c.nombre + " " + c.apellido)
            stmt = stmt.where(
                or_(
                    full_name.like(pattern, escape="\\"),
                    func.lower(c.email).like(pattern, escape="\\"),
                    c.identificacion.like(pattern, escape="\\"),
                )
            )
        if roles:
            role_ids = select(roles_table.c.id).where(roles_table.c.nombre.in_(roles))
            stmt = stmt.where(c.rol_id.in_(role_ids))
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        if rol_id is not None:
            stmt = stmt.where(c.rol_id == rol_id)
        return self._paginate(stmt.order_by(c.nombre, c.apellido, c.id), page)


class SqlAlchemyRoleRepository(SqlAlchemyRepository[Role], ports.RoleRepository):
    entity = Role

    def get_by_nombre(self, nombre: str) -> Role | None:
        return self.session.scalars(select(Role).where(func.upper(roles_table.c.nombre) == nombre.upper())).first()

    def list(self, page, *, search=None, estado=None):
        c = roles_table.c
        stmt = select(Role)
        if search:
            stmt = stmt.where(func.lower(c.nombre).like(_like(search), escape="\\"))
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.nombre), page)


class SqlAlchemyPermissionRepository(SqlAlchemyRepository[Permission], ports.PermissionRepository):
    entity = Permission

    def list_all(self) -> list[Permission]:
        return list(self.session.scalars(select(Permission).order_by(permissions_table.c.codigo)))

    def get_many(self, ids: list[int]) -> list[Permission]:
        if not ids:
            return []
        return list(self.session.scalars(select(Permission).where(permissions_table.c.id.in_(ids))))

    def get_by_codes(self, codes: list[str]) -> list[Permission]:
        if not codes:
            return []
        return list(self.session.scalars(select(Permission).where(permissions_table.c.codigo.in_(codes))))


class SqlAlchemyCategoryRepository(SqlAlchemyRepository[Category], ports.CategoryRepository):
    entity = Category

    def get_by_nombre(self, nombre: str) -> Category | None:
        c = categories_table.c
        return self.session.scalars(select(Category).where(func.lower(c.nombre) == nombre.strip().lower())).first()

    def list(self, page, *, search=None, estado=None):
        c = categories_table.c
        stmt = select(Category)
        if search:
            stmt = stmt.where(func.lower(c.nombre).like(_like(search), escape="\\"))
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.nombre), page)


class SqlAlchemyProductRepository(SqlAlchemyRepository[Product], ports.ProductRepository):
    entity = Product

    def get_by_sku(self, sku: str) -> Product | None:
        return self.session.scalars(select(Product).where(products_table.c.sku == sku.strip().upper())).first()

    def list(self, page, *, search=None, category_id=None, estado=None):
        c = products_table.c
        stmt = select(Product)
        if search:
            pattern = _like(search)
            stmt = stmt.where(
                or_(
                    func.lower(c.nombre).like(pattern, escape="\\"),
                    func.lower(c.sku).like(pattern, escape="\\"),
                    func.lower(func.coalesce(c.descripcion, "")).like(pattern, escape="\\"),
                )
            )
        if category_id is not None:
            stmt = stmt.where(c.category_id == category_id)
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.nombre, c.id), page)


class SqlAlchemyBranchRepository(SqlAlchemyRepository[Branch], ports.BranchRepository):
    entity = Branch

    def get_by_nombre(self, nombre: str) -> Branch | None:
        c = branches_table.c
        return self.session.scalars(select(Branch).where(func.lower(c.nombre) == nombre.strip().lower())).first()

    def get_many(self, ids: list[int]) -> list[Branch]:
        if not ids:
            return []
        return list(self.session.scalars(select(Branch).where(branches_table.c.id.in_(ids))))

    def list(self, page, *, search=None, estado=None):
        c = branches_table.c
        stmt = select(Branch)
        if search:
            pattern = _like(search)
            stmt = stmt.where(
                or_(func.lower(c.nombre).like(pattern, escape="\\"), func.lower(c.ubicacion).like(pattern, escape="\\"))
            )
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.nombre), page)


class SqlAlchemyInventoryRepository(SqlAlchemyRepository[Inventory], ports.InventoryRepository):
    entity = Inventory

    def get_for_update(self, inventory_id: int) -> Inventory | None:
        stmt = select(Inventory).where(inventory_table.c.id == inventory_id).with_for_update(of=inventory_table)
        # populate_existing refreshes an already loaded instance with the locked row values.
        return self.session.scalars(stmt.execution_options(populate_existing=True)).first()

    def get_by_product_and_branch(self, product_id: int, branch_id: int) -> Inventory | None:
        c = inventory_table.c
        return self.session.scalars(select(Inventory).where(c.product_id == product_id, c.branch_id == branch_id)).first()

    def list(self, page, *, search=None, branch_id=None, product_id=None, with_stock=None, active_products=None):
        c = inventory_table.c
        p = products_table.alias("inventory_product")
        b = branches_table.alias("inventory_branch")
        stmt = select(Inventory).join(p, p.c.id == c.product_id).join(b, b.c.id == c.branch_id)
        if search:
            pattern = _like(search)
            stmt = stmt.where(
                or_(func.lower(p.c.sku).like(pattern, escape="\\"), func.lower(p.c.nombre).like(pattern, escape="\\"))
            )
        if branch_id is not None:
            stmt = stmt.where(c.branch_id == branch_id)
        if product_id is not None:
            stmt = stmt.where(c.product_id == product_id)
        if with_stock is True:
            stmt = stmt.where(c.stock > 0)
        elif with_stock is False:
            stmt = stmt.where(c.stock == 0)
        if active_products:
            stmt = stmt.where(p.c.estado.is_(True), b.c.estado.is_(True))
        return self._paginate(stmt.order_by(p.c.nombre, b.c.nombre, c.id), page)


class SqlAlchemyStockMovementRepository(ports.StockMovementRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, movement: StockMovement) -> StockMovement:
        self.session.add(movement)
        return movement

    def list_by_inventory(self, inventory_id: int, page: PageRequest) -> Page[StockMovement]:
        c = stock_movements_table.c
        stmt = select(StockMovement).where(c.inventory_id == inventory_id).order_by(c.fecha.desc(), c.id.desc())
        total = self.session.scalar(select(func.count()).where(c.inventory_id == inventory_id)) or 0
        items = list(self.session.scalars(stmt.limit(page.size).offset(page.offset)))
        return Page(items=items, total=total, page=page.page, size=page.size)


class SqlAlchemySaleRepository(SqlAlchemyRepository[Sale], ports.SaleRepository):
    entity = Sale

    def list(self, page, *, user_id=None, estado: SaleStatus | None = None, desde=None, hasta=None, identificacion=None):
        c = sales_table.c
        stmt = select(Sale)
        if user_id is not None:
            stmt = stmt.where(c.user_id == user_id)
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        if desde is not None:
            stmt = stmt.where(c.fecha >= _utc_naive(desde))
        if hasta is not None:
            stmt = stmt.where(c.fecha < _utc_naive(hasta))
        if identificacion:
            clients = select(users_table.c.id).where(
                users_table.c.identificacion.like(f"{identificacion.strip()}%")
            )
            stmt = stmt.where(c.cliente_id.in_(clients))
        return self._paginate(stmt.order_by(c.fecha.desc(), c.id.desc()), page)

    def summary(self, *, user_id, desde, hasta):
        c = sales_table.c
        row = self.session.execute(
            select(func.count(), func.coalesce(func.sum(c.total_pagar), 0)).where(
                c.user_id == user_id,
                c.estado == SaleStatus.CONFIRMADA,
                c.fecha >= _utc_naive(desde),
                c.fecha < _utc_naive(hasta),
            )
        ).one()
        return int(row[0]), Decimal(row[1])


class SqlAlchemyBrandRepository(SqlAlchemyRepository[Brand], ports.BrandRepository):
    entity = Brand

    def get_by_nombre(self, nombre: str) -> Brand | None:
        c = brands_table.c
        return self.session.scalars(select(Brand).where(func.lower(c.nombre) == nombre.strip().lower())).first()

    def list(self, page, *, search=None, estado=None):
        c = brands_table.c
        stmt = select(Brand)
        if search:
            stmt = stmt.where(func.lower(c.nombre).like(_like(search), escape="\\"))
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.nombre), page)


class SqlAlchemyDeviceModelRepository(SqlAlchemyRepository[DeviceModel], ports.DeviceModelRepository):
    entity = DeviceModel

    def get_by_brand_and_nombre(self, brand_id: int, nombre: str) -> DeviceModel | None:
        c = models_table.c
        stmt = select(DeviceModel).where(c.brand_id == brand_id, func.lower(c.nombre) == nombre.strip().lower())
        return self.session.scalars(stmt).first()

    def list(self, page, *, search=None, brand_id=None, estado=None):
        c = models_table.c
        stmt = select(DeviceModel)
        if search:
            stmt = stmt.where(func.lower(c.nombre).like(_like(search), escape="\\"))
        if brand_id is not None:
            stmt = stmt.where(c.brand_id == brand_id)
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.nombre), page)


class SqlAlchemySparePartRepository(SqlAlchemyRepository[SparePart], ports.SparePartRepository):
    entity = SparePart

    def list(self, page, *, search=None, estado=None):
        c = spare_parts_table.c
        stmt = select(SparePart)
        if search:
            stmt = stmt.where(func.lower(c.tipo).like(_like(search), escape="\\"))
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        return self._paginate(stmt.order_by(c.tipo, c.id), page)


class SqlAlchemyWorkOrderRepository(SqlAlchemyRepository[WorkOrder], ports.WorkOrderRepository):
    entity = WorkOrder

    def add(self, entity: WorkOrder) -> WorkOrder:
        self.session.add(entity)
        if entity.num_orden is None:
            # Portable auto-increment: the order number is the (unique) internal id.
            # Replace with a DB sequence once the database is defined (spec §13).
            self.session.flush()
            entity.num_orden = entity.id
            self.session.flush()
        return entity

    def get_by_num_orden(self, num_orden: int) -> WorkOrder | None:
        return self.session.scalars(select(WorkOrder).where(work_orders_table.c.num_orden == num_orden)).first()

    def get_by_codigo_publico(self, codigo: str) -> WorkOrder | None:
        return self.session.scalars(select(WorkOrder).where(work_orders_table.c.codigo_publico == codigo)).first()

    def list(
        self,
        page,
        *,
        num_orden=None,
        cliente=None,
        cliente_id=None,
        tecnico_id=None,
        estado=None,
        fecha_desde=None,
        fecha_hasta=None,
    ):
        c = work_orders_table.c
        stmt = select(WorkOrder)
        if num_orden is not None:
            stmt = stmt.where(c.num_orden == num_orden)
        if cliente:
            u = users_table.alias("cliente_filter")
            pattern = _like(cliente)
            stmt = stmt.join(u, u.c.id == c.cliente_id).where(
                or_(
                    func.lower(u.c.nombre + " " + u.c.apellido).like(pattern, escape="\\"),
                    func.lower(u.c.email).like(pattern, escape="\\"),
                    u.c.identificacion.like(pattern, escape="\\"),
                )
            )
        if cliente_id is not None:
            stmt = stmt.where(c.cliente_id == cliente_id)
        if tecnico_id is not None:
            stmt = stmt.where(c.tecnico_id == tecnico_id)
        if estado is not None:
            stmt = stmt.where(c.estado == estado)
        if fecha_desde is not None:
            stmt = stmt.where(c.fecha >= fecha_desde)
        if fecha_hasta is not None:
            stmt = stmt.where(c.fecha <= fecha_hasta)
        return self._paginate(stmt.order_by(c.num_orden.desc()), page)


class SqlAlchemyDataResetRepository(ports.DataResetRepository):
    """Bulk delete of the business data, children before parents (no ON DELETE CASCADE needed)."""

    # Tables whose numbering restarts from 1 (order and sale numbers come from their ids).
    RENUMBERED = (
        work_order_spare_parts_table,
        work_order_photos_table,
        work_order_status_changes_table,
        sale_details_table,
        sales_table,
        work_orders_table,
        stock_movements_table,
        inventory_table,
        products_table,
        categories_table,
        spare_parts_table,
        models_table,
        brands_table,
    )

    def __init__(self, session: Session) -> None:
        self.session = session

    def delete_business_data(self, client_role: str) -> tuple[dict[str, int], list[str]]:
        client_ids = (
            select(users_table.c.id)
            .join(roles_table, roles_table.c.id == users_table.c.rol_id)
            .where(roles_table.c.nombre == client_role)
        )
        files = [
            *self.session.scalars(select(work_order_photos_table.c.ruta)),
            *self.session.scalars(select(products_table.c.imagen).where(products_table.c.imagen.is_not(None))),
            *self.session.scalars(
                select(users_table.c.foto).where(users_table.c.foto.is_not(None), users_table.c.id.in_(client_ids))
            ),
        ]
        # MySQL cannot delete from a table selected in its own subquery: resolve the ids first.
        client_id_list = list(self.session.scalars(client_ids))

        def remove(table, *where) -> int:
            return self.session.execute(delete(table).where(*where)).rowcount

        counts = {
            "ordenes_repuestos": remove(work_order_spare_parts_table),
            "ordenes_fotos": remove(work_order_photos_table),
            "ordenes_historial": remove(work_order_status_changes_table),
            "ventas_detalles": remove(sale_details_table),
            "ventas": remove(sales_table),
            "ordenes": remove(work_orders_table),
            "movimientos_stock": remove(stock_movements_table),
            "inventario": remove(inventory_table),
            "productos": remove(products_table),
            "categorias": remove(categories_table),
            "repuestos": remove(spare_parts_table),
            "modelos": remove(models_table),
            "marcas": remove(brands_table),
            "clientes": remove(users_table, users_table.c.id.in_(client_id_list)) if client_id_list else 0,
        }
        return counts, files

    def restart_numbering(self) -> None:
        if self.session.get_bind().dialect.name != "mysql":
            return
        for table in self.RENUMBERED:
            # ALTER TABLE commits implicitly: only called once the data is deleted and committed.
            self.session.execute(text(f"ALTER TABLE `{table.name}` AUTO_INCREMENT = 1"))
        self.session.commit()
