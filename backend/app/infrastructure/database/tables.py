"""SQLAlchemy (MySQL) table definitions and imperative mapping of domain entities.

Domain entities are plain dataclasses; they are mapped here so the domain layer
has no dependency on SQLAlchemy.
"""
from __future__ import annotations

from datetime import timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    TypeDecorator,
    UniqueConstraint,
    func,
    select,
    text,
)
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.orm import column_property, registry, relationship

from app.domain.entities import (
    AffiliatePart,
    Branch,
    Brand,
    Category,
    DeviceModel,
    Inventory,
    Permission,
    Product,
    Role,
    Sale,
    SaleDetail,
    SparePart,
    StockMovement,
    User,
    WorkOrder,
    WorkOrderPhoto,
    WorkOrderSparePart,
    WorkOrderStatusChange,
)
from app.domain.entities.base import utcnow
from app.domain.value_objects.affiliate_parts import AffiliatePartStatus, AffiliatePartType, PartCondition
from app.domain.value_objects.enums import PaymentMethod, SaleStatus, StockMovementType
from app.domain.value_objects.work_orders import DisplayType, EntryReason, LockType

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=NAMING_CONVENTION)
mapper_registry = registry(metadata=metadata)

MONEY = Numeric(12, 2)
class UtcDateTime(TypeDecorator):
    """DATETIME(6) stored as naive UTC; Python values are timezone-aware (UTC).

    Aware values are serialized with their offset, so clients show the right local time.
    """

    impl = DATETIME(fsp=6)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


TIMESTAMP = UtcDateTime()  # stored in UTC

TRUE = text("1")
FALSE = text("0")


def _str_enum(enum_cls: type) -> Enum:
    # Stored as VARCHAR (no native enum / check constraint) so new values can be added freely.
    return Enum(
        enum_cls,
        native_enum=False,
        create_constraint=False,
        length=30,
        values_callable=lambda e: [m.value for m in e],
    )


class StrEnumList(TypeDecorator):
    """A list of enum values stored as comma separated codes in a VARCHAR ("PANTALLA,BATERIA")."""

    impl = String(255)
    cache_ok = True

    def __init__(self, enum_cls: type, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.enum_cls = enum_cls

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return ",".join(self.enum_cls(v).value for v in value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return [self.enum_cls(v) for v in value.split(",") if v]


def _timestamps() -> list[Column]:
    return [
        Column("created_at", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)")),
        Column(
            "updated_at",
            TIMESTAMP,
            nullable=False,
            default=utcnow,
            onupdate=utcnow,
            server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        ),
    ]


permissions_table = Table(
    "permissions",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("codigo", String(100), nullable=False, unique=True),
    Column("descripcion", String(255)),
)

roles_table = Table(
    "roles",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(50), nullable=False, unique=True),
    Column("descripcion", String(255)),
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
)

role_permissions_table = Table(
    "role_permissions",
    metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

users_table = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(100), nullable=False),
    Column("apellido", String(100), nullable=False),
    Column("email", String(255), unique=True),  # login; optional for clients (NULL)
    Column("password", String(255)),  # bcrypt hash; NULL for clients (no login)
    Column("identificacion", String(13), unique=True),  # cédula (10) / RUC (13)
    Column("celular", String(20)),
    Column("provincia", String(100)),
    Column("ciudad", String(100)),  # canton of the province (see value_objects/locations.py)
    Column("direccion", String(255)),  # address (shown in the affiliate spare parts)
    Column("foto", String(255)),  # relative path in the media storage
    Column("rol_id", ForeignKey("roles.id"), nullable=False, index=True),  # the role defines the user kind
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
)

categories_table = Table(
    "categories",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(100), nullable=False, unique=True),
    Column("descripcion", Text),
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
)

products_table = Table(
    "products",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("category_id", ForeignKey("categories.id"), nullable=False, index=True),
    Column("sku", String(50), nullable=False, unique=True),
    Column("nombre", String(150), nullable=False, index=True),
    Column("descripcion", Text),
    Column("precio_venta", MONEY, nullable=False),  # PVP
    Column("precio_costo", MONEY, nullable=False),  # acquisition cost
    Column("precio_mayor", MONEY, nullable=False),  # wholesale
    Column("imagen", String(255)),  # relative path in the media storage
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
    CheckConstraint("precio_venta >= 0 AND precio_costo >= 0 AND precio_mayor >= 0", name="precios_non_negative"),
)

branches_table = Table(
    "branches",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(100), nullable=False, unique=True),
    Column("ubicacion", String(255), nullable=False),
    Column("telefono", String(20)),
    Column("direccion", String(255)),  # printed on the work order receipt
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
)

user_branches_table = Table(
    "user_branches",
    metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("branch_id", ForeignKey("branches.id", ondelete="CASCADE"), primary_key=True),
)

inventory_table = Table(
    "inventory",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("product_id", ForeignKey("products.id"), nullable=False, index=True),
    Column("branch_id", ForeignKey("branches.id"), nullable=False, index=True),
    Column("stock", Integer, nullable=False, default=0, server_default=FALSE),
    *_timestamps(),
    UniqueConstraint("product_id", "branch_id", name="uq_inventory_product_id_branch_id"),
    CheckConstraint("stock >= 0", name="stock_non_negative"),
)

stock_movements_table = Table(
    "stock_movements",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("product_id", ForeignKey("products.id"), nullable=False, index=True),
    Column("inventory_id", ForeignKey("inventory.id"), index=True),  # product + branch
    Column("tipo", _str_enum(StockMovementType), nullable=False),
    Column("cantidad", Integer, nullable=False),
    Column("stock_resultante", Integer, nullable=False),
    Column("user_id", ForeignKey("users.id")),
    Column("referencia", String(100)),
    Column("motivo", String(255)),
    Column("fecha", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)")),
)

sales_table = Table(
    "sales",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("branch_id", ForeignKey("branches.id"), nullable=False, index=True),  # sucursal
    Column("fecha", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)"), index=True),
    Column("total", MONEY, nullable=False),
    Column("estado", _str_enum(SaleStatus), nullable=False),
    Column("factura", Boolean, nullable=False, default=False, server_default=FALSE),  # 1 factura / 0 comprobante
    Column("cliente_id", ForeignKey("users.id"), index=True),  # NULL = consumidor final
    Column("metodo_pago", _str_enum(PaymentMethod)),  # NULL only for sales before payments were recorded
    Column("recargo", MONEY, nullable=False, default=0, server_default=FALSE),  # credit card surcharge
    Column("total_pagar", MONEY, nullable=False, default=0, server_default=FALSE),  # total + recargo
    Column("monto_recibido", MONEY),  # cash received
    Column("cambio", MONEY),  # change given back (cash)
    # Sale of a finalized work order (no product lines); one sale per order.
    Column("work_order_id", ForeignKey("work_orders.id"), unique=True),
    *_timestamps(),
)

sale_details_table = Table(
    "sale_details",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("sale_id", ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("product_id", ForeignKey("products.id"), nullable=False, index=True),
    Column("inventory_id", ForeignKey("inventory.id"), nullable=False, index=True),  # stock taken from
    Column("cantidad", Integer, nullable=False),
    Column("precio_unitario", MONEY, nullable=False),
    Column("subtotal", MONEY, nullable=False),
    CheckConstraint("cantidad > 0", name="cantidad_positive"),
)

brands_table = Table(
    "brands",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(100), nullable=False, unique=True),
    Column("descripcion", Text),
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
)

models_table = Table(
    "models",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("brand_id", ForeignKey("brands.id"), nullable=False, index=True),
    Column("nombre", String(100), nullable=False),
    Column("descripcion", Text),
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
    UniqueConstraint("brand_id", "nombre", name="uq_models_brand_id_nombre"),
)

spare_parts_table = Table(
    "spare_parts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("tipo", String(100), nullable=False, index=True),
    Column("ubicacion", Boolean, nullable=False, default=False, server_default=FALSE),
    Column("precio", MONEY, nullable=False),
    Column("garantia", Boolean, nullable=False, default=False, server_default=FALSE),
    Column("estado", Boolean, nullable=False, default=True, server_default=TRUE),
    *_timestamps(),
)

work_orders_table = Table(
    "work_orders",
    metadata,
    Column("id", Integer, primary_key=True),
    # Unique order number. Assigned from the internal id on insert (portable across databases).
    Column("num_orden", Integer, unique=True),
    Column("user_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("cliente_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("tecnico_id", ForeignKey("users.id"), index=True),
    Column("branch_id", ForeignKey("branches.id"), index=True),  # sucursal (local) that receives the device
    Column("marca_id", ForeignKey("brands.id"), nullable=False),
    Column("modelo_id", ForeignKey("models.id"), nullable=False),
    Column("observacion", Text),
    Column("estado", Integer, nullable=False, default=0, server_default=FALSE, index=True),
    Column("motivo_ingreso", StrEnumList(EntryReason), nullable=False),  # one or more, comma separated
    Column("tipo_display", _str_enum(DisplayType)),  # only for CAMBIO_DISPLAY
    Column("garantia_dias", Integer, nullable=False, default=0, server_default=FALSE),  # tiempo de garantía
    Column("bloqueo_tipo", _str_enum(LockType), nullable=False, server_default=text("'NINGUNO'")),
    Column("bloqueo_valor", String(20)),  # pattern "1-5-9-6" or PIN
    Column("codigo_publico", String(32), nullable=False, unique=True),  # public status page (QR)
    Column("color", String(50)),
    Column("modelo_tecnico", String(50)),  # technical model code of the phone, e.g. SM-A105M
    Column("presupuesto", MONEY, nullable=False),
    Column("anticipo", MONEY, nullable=False),
    Column("saldo", MONEY, nullable=False),
    Column("fecha", Date, nullable=False, index=True),  # local day of fecha_hora (filters, dashboard)
    # Reception date and time (UTC); editable in the form, defaults to now.
    Column("fecha_hora", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)")),
    Column("fecha_entrega", TIMESTAMP),  # promised delivery date and time (UTC)
    *_timestamps(),
    CheckConstraint("estado IN (0, 1, 2)", name="estado_valid"),
    CheckConstraint("garantia_dias >= 0", name="garantia_dias_non_negative"),
    CheckConstraint("presupuesto >= 0 AND anticipo >= 0", name="amounts_non_negative"),
)

work_order_status_changes_table = Table(
    "work_order_status_changes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("work_order_id", ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("estado", Integer, nullable=False),
    Column("user_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("observacion", Text),
    Column("fecha_entrega", TIMESTAMP),  # approximate delivery time given when it goes En proceso
    Column("created_at", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)")),
)

work_order_photos_table = Table(
    "work_order_photos",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("work_order_id", ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("ruta", String(255), nullable=False),  # relative path in the media storage
    Column("created_at", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)")),
)

work_order_spare_parts_table = Table(
    "work_order_spare_parts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("work_order_id", ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("technician_id", ForeignKey("users.id"), nullable=False, index=True),
    Column("spare_part_id", ForeignKey("spare_parts.id"), nullable=False, index=True),
    Column("cantidad", Integer, nullable=False),
    Column("precio", MONEY, nullable=False),
    Column("fecha", TIMESTAMP, nullable=False, default=utcnow, server_default=text("CURRENT_TIMESTAMP(6)")),
    CheckConstraint("cantidad > 0", name="cantidad_positive"),
)

affiliate_parts_table = Table(
    "affiliate_parts",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", ForeignKey("users.id"), nullable=False, index=True),  # affiliate who published it
    Column("tipo", _str_enum(AffiliatePartType), nullable=False, index=True),
    Column("condicion", _str_enum(PartCondition), nullable=False),  # nuevo / usado
    Column("garantia", Boolean, nullable=False, default=False, server_default=FALSE),
    Column("estado", _str_enum(AffiliatePartStatus), nullable=False, index=True),  # disponible / vendido
    Column("descripcion", Text),
    Column("precio", MONEY),
    Column("imagen", String(255)),  # relative path in the media storage
    *_timestamps(),
    CheckConstraint("precio IS NULL OR precio >= 0", name="precio_non_negative"),
)

# Visit counters of public pages (e.g. the affiliate spare parts catalog).
page_visits_table = Table(
    "page_visits",
    metadata,
    Column("pagina", String(50), primary_key=True),
    Column("visitas", Integer, nullable=False, default=0, server_default=FALSE),
    Column(
        "updated_at",
        TIMESTAMP,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
    ),
)

# Configurable values of the system (e.g. the sales goals of the header).
settings_table = Table(
    "settings",
    metadata,
    Column("clave", String(50), primary_key=True),
    Column("valor", String(255), nullable=False),
    Column(
        "updated_at",
        TIMESTAMP,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
    ),
)

Index("ix_users_nombre_apellido", users_table.c.nombre, users_table.c.apellido)

# InnoDB (transactions, FKs, row locks for SELECT ... FOR UPDATE) and full Unicode.
# The *_unicode_ci collation makes unique names/emails case-insensitive, like the app rules.
for _table in metadata.tables.values():
    _table.dialect_kwargs.update(
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}
    )

_mapped = False


def start_mappers() -> None:
    """Map domain entities to tables. Idempotent."""
    global _mapped
    if _mapped:
        return
    _mapped = True

    mapper_registry.map_imperatively(Permission, permissions_table)
    mapper_registry.map_imperatively(
        Role,
        roles_table,
        properties={
            "permissions": relationship(
                Permission, secondary=role_permissions_table, lazy="selectin", order_by=permissions_table.c.codigo
            )
        },
    )
    mapper_registry.map_imperatively(Branch, branches_table)
    mapper_registry.map_imperatively(
        User,
        users_table,
        properties={
            "role": relationship(Role, lazy="joined"),
            "branches": relationship(
                Branch, secondary=user_branches_table, lazy="selectin", order_by=branches_table.c.nombre
            ),
        },
    )
    mapper_registry.map_imperatively(Category, categories_table)
    stock_total = (
        select(func.coalesce(func.sum(inventory_table.c.stock), 0))
        .where(inventory_table.c.product_id == products_table.c.id)
        .correlate_except(inventory_table)
        .scalar_subquery()
    )
    mapper_registry.map_imperatively(
        Product,
        products_table,
        properties={
            "category": relationship(Category, lazy="joined"),
            "stock_total": column_property(stock_total),  # read-only: stock of every branch
        },
    )
    mapper_registry.map_imperatively(
        Inventory,
        inventory_table,
        properties={
            "product": relationship(Product, lazy="joined"),
            "branch": relationship(Branch, lazy="joined"),
        },
    )
    mapper_registry.map_imperatively(StockMovement, stock_movements_table)
    mapper_registry.map_imperatively(
        SaleDetail, sale_details_table, properties={"product": relationship(Product, lazy="joined")}
    )
    mapper_registry.map_imperatively(
        Sale,
        sales_table,
        properties={
            "details": relationship(
                SaleDetail, lazy="selectin", cascade="all, delete-orphan", order_by=sale_details_table.c.id
            ),
            "user": relationship(User, foreign_keys=[sales_table.c.user_id], lazy="joined"),
            "cliente": relationship(User, foreign_keys=[sales_table.c.cliente_id], lazy="joined"),
            "branch": relationship(Branch, lazy="joined"),
            "work_order": relationship(WorkOrder, lazy="selectin", viewonly=True),
        },
    )
    modelos_count = (
        select(func.count(models_table.c.id))
        .where(models_table.c.brand_id == brands_table.c.id)
        .correlate_except(models_table)
        .scalar_subquery()
    )
    mapper_registry.map_imperatively(
        # Read-only. Deferred: brands are joined into models and orders, only the brand list needs it.
        Brand, brands_table, properties={"modelos_count": column_property(modelos_count, deferred=True)}
    )
    mapper_registry.map_imperatively(
        DeviceModel, models_table, properties={"brand": relationship(Brand, lazy="joined")}
    )
    mapper_registry.map_imperatively(SparePart, spare_parts_table)
    mapper_registry.map_imperatively(
        WorkOrderSparePart,
        work_order_spare_parts_table,
        properties={
            "spare_part": relationship(SparePart, lazy="joined"),
            "technician": relationship(User, lazy="joined"),
        },
    )
    mapper_registry.map_imperatively(WorkOrderPhoto, work_order_photos_table)
    mapper_registry.map_imperatively(
        WorkOrderStatusChange,
        work_order_status_changes_table,
        properties={"user": relationship(User, lazy="joined")},
    )
    mapper_registry.map_imperatively(
        AffiliatePart, affiliate_parts_table, properties={"user": relationship(User, lazy="joined")}
    )
    wo = work_orders_table.c
    mapper_registry.map_imperatively(
        WorkOrder,
        work_orders_table,
        properties={
            "user": relationship(User, foreign_keys=[wo.user_id], lazy="joined"),
            "cliente": relationship(User, foreign_keys=[wo.cliente_id], lazy="joined"),
            "tecnico": relationship(User, foreign_keys=[wo.tecnico_id], lazy="joined"),
            "branch": relationship(Branch, lazy="joined"),
            "marca": relationship(Brand, lazy="joined"),
            "modelo": relationship(DeviceModel, lazy="joined"),
            "spare_parts": relationship(
                WorkOrderSparePart,
                lazy="selectin",
                cascade="all, delete-orphan",
                order_by=work_order_spare_parts_table.c.id,
            ),
            "photos": relationship(
                WorkOrderPhoto,
                lazy="selectin",
                cascade="all, delete-orphan",
                order_by=work_order_photos_table.c.id,
            ),
            "status_changes": relationship(
                WorkOrderStatusChange,
                lazy="selectin",
                cascade="all, delete-orphan",
                order_by=work_order_status_changes_table.c.id,
            ),
            "sale": relationship(
                Sale,
                primaryjoin=sales_table.c.work_order_id == wo.id,
                foreign_keys=[sales_table.c.work_order_id],
                uselist=False,
                viewonly=True,
                lazy="selectin",
            ),
        },
    )
