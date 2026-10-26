"""Repository interfaces (ports). Implementations live in the infrastructure layer."""
from __future__ import annotations

from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Generic, Iterator, TypeVar

from app.domain.entities import (
    AffiliatePart,
    Branch,
    Brand,
    CashOpening,
    Category,
    DeviceModel,
    Inventory,
    Permission,
    Product,
    Role,
    Sale,
    SparePart,
    Supplier,
    StockMovement,
    User,
    WorkOrder,
)
from app.domain.value_objects.affiliate_parts import AffiliatePartStatus, AffiliatePartType, PartCondition
from app.domain.value_objects.enums import SaleStatus
from app.domain.value_objects.pagination import Page, PageRequest
from app.domain.value_objects.whatsapp import WhatsAppMessageStatus
from app.domain.value_objects.work_orders import EntryReason

T = TypeVar("T")


class Repository(ABC, Generic[T]):
    @abstractmethod
    def add(self, entity: T) -> T: ...

    @abstractmethod
    def get(self, entity_id: int) -> T | None: ...

    @abstractmethod
    def delete(self, entity: T) -> None: ...


@dataclass(frozen=True)
class TopProduct:
    """A product and what was sold of it in confirmed sales (Ventas statistics)."""

    id: int
    sku: str
    nombre: str
    cantidad: int  # units sold
    monto: Decimal  # sum of the line subtotals


@dataclass(frozen=True)
class UserSaleRef:
    id: int
    fecha: datetime
    total_pagar: Decimal
    estado: str
    rol: str  # "Vendedor" | "Cliente"


@dataclass(frozen=True)
class UserOrderRef:
    id: int
    num_orden: int | None
    fecha: date
    estado: int
    rol: str  # "Registró" | "Cliente" | "Técnico"


@dataclass(frozen=True)
class UserUsage:
    """Records that reference a user (shown before deleting it)."""

    ventas: list[UserSaleRef] = field(default_factory=list)  # most recent first (limited)
    ventas_total: int = 0
    ordenes: list[UserOrderRef] = field(default_factory=list)
    ordenes_total: int = 0
    otros_total: int = 0  # status history, spare parts, stock movements, affiliate parts

    @property
    def has_records(self) -> bool:
        return bool(self.ventas_total or self.ordenes_total or self.otros_total)


class UserRepository(Repository[User]):
    @abstractmethod
    def usage(self, user_id: int, limit: int = 50) -> UserUsage: ...

    @abstractmethod
    def reassign_references(self, from_user_id: int, to_user_id: int) -> None:
        """Every sale, order, history entry, stock movement and affiliate part of ``from`` goes to ``to``."""

    @abstractmethod
    def get_by_email(self, email: str) -> User | None: ...

    @abstractmethod
    def get_by_identificacion(self, identificacion: str) -> User | None: ...

    @abstractmethod
    def find_same_person(self, identificacion: str) -> list[User]:
        """Users with the same cédula / RUC, including the cédula ↔ natural-person RUC
        relation (``1712345675`` and ``1712345675001`` belong to the same person)."""

    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        search: str | None = None,
        roles: list[str] | None = None,
        estado: bool | None = None,
        rol_id: int | None = None,
    ) -> Page[User]: ...


class RoleRepository(Repository[Role]):
    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Role | None: ...

    @abstractmethod
    def list(self, page: PageRequest, *, search: str | None = None, estado: bool | None = None) -> Page[Role]: ...


class PermissionRepository(Repository[Permission]):
    @abstractmethod
    def list_all(self) -> list[Permission]: ...

    @abstractmethod
    def get_many(self, ids: list[int]) -> list[Permission]: ...

    @abstractmethod
    def get_by_codes(self, codes: list[str]) -> list[Permission]: ...


class CategoryRepository(Repository[Category]):
    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Category | None: ...

    @abstractmethod
    def list(self, page: PageRequest, *, search: str | None = None, estado: bool | None = None) -> Page[Category]: ...


class ProductRepository(Repository[Product]):
    @abstractmethod
    def get_by_sku(self, sku: str) -> Product | None: ...

    @abstractmethod
    def below_minimum(self) -> list[Product]:
        """Active products whose total stock (every branch) is below their ``minimo_recomendado`` (> 0),
        the biggest shortage first."""

    @abstractmethod
    def stock_value(self) -> tuple[Decimal, Decimal]:
        """Sum of ``precio_venta * stock`` and of ``precio_costo * stock`` (stock of every branch)."""

    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        search: str | None = None,
        category_id: int | None = None,
        estado: bool | None = None,
    ) -> Page[Product]: ...


class SupplierRepository(Repository[Supplier]):
    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Supplier | None: ...

    @abstractmethod
    def list(self, page: PageRequest, *, search: str | None = None, estado: bool | None = None) -> Page[Supplier]: ...


class BranchRepository(Repository[Branch]):
    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Branch | None: ...

    @abstractmethod
    def get_many(self, ids: list[int]) -> list[Branch]: ...

    @abstractmethod
    def list(self, page: PageRequest, *, search: str | None = None, estado: bool | None = None) -> Page[Branch]: ...


class InventoryRepository(Repository[Inventory]):
    @abstractmethod
    def get_for_update(self, inventory_id: int) -> Inventory | None:
        """Load an inventory row locking it (``SELECT ... FOR UPDATE``)."""

    @abstractmethod
    def get_by_product_and_branch(self, product_id: int, branch_id: int) -> Inventory | None: ...

    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        search: str | None = None,
        branch_id: int | None = None,
        product_id: int | None = None,
        with_stock: bool | None = None,
        active_products: bool | None = None,
    ) -> Page[Inventory]:
        """``search`` matches the product SKU or name."""


class StockMovementRepository(ABC):
    @abstractmethod
    def add(self, movement: StockMovement) -> StockMovement: ...

    @abstractmethod
    def list_by_inventory(self, inventory_id: int, page: PageRequest) -> Page[StockMovement]: ...


class SaleRepository(Repository[Sale]):
    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        user_id: int | None = None,
        estado: SaleStatus | None = None,
        desde: datetime | None = None,
        hasta: datetime | None = None,
        identificacion: str | None = None,
    ) -> Page[Sale]:
        """``desde`` inclusive / ``hasta`` exclusive (UTC); ``identificacion`` = client cédula / RUC (prefix)."""

    @abstractmethod
    def confirmed_totals(self, *, desde: datetime, hasta: datetime) -> list[tuple[datetime, Decimal]]:
        """Date and amount charged (total_pagar) of every confirmed sale in ``[desde, hasta)``."""

    @abstractmethod
    def summary(self, *, user_id: int, desde: datetime, hasta: datetime) -> tuple[int, Decimal, Decimal]:
        """Number of confirmed sales of the user in the range, the amount charged (total_pagar) and the
        spare part cost of the work order sales (costo_repuesto)."""

    @abstractmethod
    def top_products(self, *, limit: int) -> list[TopProduct]:
        """Products with the most units sold in confirmed sales, the most sold first."""


class BrandRepository(Repository[Brand]):
    @abstractmethod
    def get_by_nombre(self, nombre: str) -> Brand | None: ...

    @abstractmethod
    def list(self, page: PageRequest, *, search: str | None = None, estado: bool | None = None) -> Page[Brand]: ...


class DeviceModelRepository(Repository[DeviceModel]):
    @abstractmethod
    def get_by_brand_and_nombre(self, brand_id: int, nombre: str) -> DeviceModel | None: ...

    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        search: str | None = None,
        brand_id: int | None = None,
        estado: bool | None = None,
    ) -> Page[DeviceModel]: ...


class SparePartRepository(Repository[SparePart]):
    @abstractmethod
    def list(self, page: PageRequest, *, search: str | None = None, estado: bool | None = None) -> Page[SparePart]: ...


@dataclass(frozen=True)
class BrandOrders:
    """A brand and the number of work orders received of its phones (Órdenes statistics)."""

    id: int
    nombre: str
    ordenes: int


@dataclass(frozen=True)
class OrderClient:
    """A client that came through Órdenes (has at least one work order), with the phone of
    their most recent order. Recipient of the Propaganda (CRM) messages."""

    cliente_id: int
    nombre: str
    apellido: str
    celular: str | None
    marca: str  # brand of the phone of the most recent order
    modelo: str
    ordenes: int  # number of work orders of the client
    ultima_orden: date  # reception date of the most recent order
    identificacion: str | None = None  # cédula / RUC, to find the client in Propaganda


class WorkOrderRepository(Repository[WorkOrder]):
    @abstractmethod
    def day_activity(self, *, day: date, desde: datetime, hasta: datetime) -> tuple[int, int, int]:
        """Orders received on ``day`` and orders that changed to En proceso / Finalizado in ``[desde, hasta)``."""

    @abstractmethod
    def top_brands(self, *, limit: int) -> list[BrandOrders]:
        """Brands with the most work orders received, the most first."""

    @abstractmethod
    def entry_reasons(self) -> list[list[EntryReason]]:
        """The ``motivo_ingreso`` (one or more) of every work order."""

    @abstractmethod
    def overdue(self, *, now: datetime) -> list[WorkOrder]:
        """Orders not finalized whose ``fecha_entrega`` already passed, the most overdue first."""

    @abstractmethod
    def due_soon(self, *, now: datetime, until: datetime) -> list[WorkOrder]:
        """Orders not finalized whose ``fecha_entrega`` is in ``[now, until)``, the soonest first."""

    @abstractmethod
    def reception_dates(self, *, desde: date, hasta: date) -> list[date]:
        """Reception date of every order received between ``desde`` and ``hasta`` (inclusive)."""

    @abstractmethod
    def order_clients(self, *, search: str | None = None, marca_id: int | None = None) -> list[OrderClient]:
        """Active clients with at least one work order (not the ones that only bought in Ventas),
        ordered by name. ``marca_id`` keeps the clients whose most recent order is of that brand."""

    @abstractmethod
    def get_by_num_orden(self, num_orden: int) -> WorkOrder | None: ...

    @abstractmethod
    def get_by_codigo_publico(self, codigo: str) -> WorkOrder | None: ...

    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        num_orden: int | None = None,
        cliente: str | None = None,
        cliente_id: int | None = None,
        tecnico_id: int | None = None,
        estado: int | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
    ) -> Page[WorkOrder]: ...


class AffiliatePartRepository(Repository[AffiliatePart]):
    @abstractmethod
    def list(
        self,
        page: PageRequest,
        *,
        user_id: int | None = None,
        tipo: AffiliatePartType | None = None,
        condicion: PartCondition | None = None,
        estado: AffiliatePartStatus | None = None,
        garantia: bool | None = None,
        search: str | None = None,
        active_affiliates: bool = False,
    ) -> Page[AffiliatePart]:
        """``search`` matches the description or the affiliate name / city; ``active_affiliates``
        leaves out the parts of deactivated users (public catalog)."""


class PageVisitRepository(ABC):
    @abstractmethod
    def increment(self, pagina: str) -> int:
        """Adds one visit to the page and returns the new total."""

    @abstractmethod
    def count(self, pagina: str) -> int: ...


class SettingsRepository(ABC):
    """Configurable values of the system (key / value)."""

    @abstractmethod
    def get_values(self, claves: list[str]) -> dict[str, str]: ...

    @abstractmethod
    def set_value(self, clave: str, valor: str) -> None: ...


class CashOpeningRepository(ABC):
    """Daily cash openings (apertura de caja) of the sellers."""

    @abstractmethod
    def add(self, opening: CashOpening) -> CashOpening: ...

    @abstractmethod
    def get_for_day(self, user_id: int, fecha: date) -> CashOpening | None: ...


@dataclass(frozen=True)
class WhatsAppCampaignSummary:
    """A campaign of the WhatsApp Cloud API with how many of its messages are in each state."""

    id: int
    plantilla: str
    idioma: str
    categoria: str
    created_at: datetime
    creado_por: str | None  # full name of the user who sent it
    total: int
    pendientes: int
    enviados: int
    entregados: int
    leidos: int
    fallidos: int
    # What was sent (preview of the campaign).
    cuerpo: str | None = None
    encabezado: str | None = None
    pie: str | None = None
    imagen: str | None = None  # header image or video, path under media/


@dataclass(frozen=True)
class WhatsAppMessageRow:
    id: int
    cliente_id: int | None
    cliente: str | None  # full name; None if the client was deleted
    telefono: str
    estado: WhatsAppMessageStatus
    error: str | None
    updated_at: datetime
    parametros: list[tuple[str, str]] = field(default_factory=list)  # (placeholder, value) sent to this phone


@dataclass(frozen=True)
class PendingWhatsAppMessage:
    id: int
    telefono: str
    parametros: list[tuple[str, str]]  # (placeholder, value) of the template body


class WhatsAppRepository(ABC):
    """Campaigns, messages and opt-outs of the WhatsApp Cloud API."""

    @abstractmethod
    def create_campaign(
        self,
        *,
        plantilla: str,
        idioma: str,
        categoria: str,
        created_by: int | None,
        cuerpo: str | None = None,
        encabezado: str | None = None,
        pie: str | None = None,
        imagen: str | None = None,
    ) -> int: ...

    @abstractmethod
    def add_messages(self, campaign_id: int, messages: list[tuple[int, str, list[tuple[str, str]]]]) -> None:
        """Queues (cliente_id, telefono, parametros) as PENDIENTE."""

    @abstractmethod
    def pending_messages(self, campaign_id: int) -> list[PendingWhatsAppMessage]: ...

    @abstractmethod
    def mark_sent(self, message_id: int, wa_message_id: str) -> None: ...

    @abstractmethod
    def mark_failed(self, message_id: int, error: str) -> None: ...

    @abstractmethod
    def apply_status(self, wa_message_id: str, estado: WhatsAppMessageStatus, error: str | None = None) -> bool:
        """State reported by a webhook; only moves forward (see STATUS_RANK). False if the message is unknown."""

    @abstractmethod
    def campaigns(self, limit: int = 50) -> list[WhatsAppCampaignSummary]:
        """Most recent first."""

    @abstractmethod
    def campaign(self, campaign_id: int) -> WhatsAppCampaignSummary | None: ...

    @abstractmethod
    def campaign_messages(self, campaign_id: int) -> list[WhatsAppMessageRow]: ...

    @abstractmethod
    def opted_out(self, telefonos: list[str]) -> set[str]:
        """The phones of the list that answered BAJA / STOP."""

    @abstractmethod
    def set_opt_out(self, telefono: str, opted_out: bool) -> None: ...


@dataclass(frozen=True)
class RouletteSummary:
    """A prize wheel with how many links were sent, opened, played and won."""

    id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    created_at: datetime
    creado_por: str | None
    items: int
    enlaces: int
    abiertos: int
    jugados: int
    ganadores: int


@dataclass(frozen=True)
class RouletteItemRow:
    id: int
    nombre: str
    imagen: str | None  # path under media/
    premio: bool


@dataclass(frozen=True)
class RoulettePlayRow:
    """A link of a wheel sent to one phone, and what happened with it."""

    id: int
    cliente_id: int | None
    cliente: str | None  # full name; None for numbers typed by hand or deleted clients
    telefono: str
    campaign_id: int | None
    created_at: datetime
    abierto_at: datetime | None
    jugado_at: datetime | None
    resultado: str | None
    gano: bool


@dataclass(frozen=True)
class RouletteLink:
    """State of one public link (looked up by its token)."""

    id: int
    roulette_id: int
    abierto_at: datetime | None
    jugado_at: datetime | None
    item_id: int | None
    resultado: str | None
    gano: bool


class RouletteRepository(ABC):
    """Prize wheels of Propaganda and their single-use links."""

    @abstractmethod
    def create(
        self,
        *,
        nombre: str,
        fecha_inicio: date,
        fecha_fin: date,
        created_by: int | None,
        items: list[tuple[str, str | None, bool]],
    ) -> int:
        """Items are (nombre, imagen, premio) in the order of the wheel. Returns the id."""

    @abstractmethod
    def summaries(self, limit: int = 100) -> list[RouletteSummary]: ...

    @abstractmethod
    def get(self, roulette_id: int) -> RouletteSummary | None: ...

    @abstractmethod
    def items(self, roulette_id: int) -> list[RouletteItemRow]: ...

    @abstractmethod
    def delete(self, roulette_id: int) -> None: ...

    @abstractmethod
    def add_links(self, roulette_id: int, campaign_id: int | None, links: list[tuple[str, int | None, str]]) -> None:
        """Links are (token, cliente_id, telefono)."""

    @abstractmethod
    def links(self, roulette_id: int) -> list[RoulettePlayRow]: ...

    @abstractmethod
    def link_by_token(self, token: str, *, for_update: bool = False) -> RouletteLink | None: ...

    @abstractmethod
    def mark_opened(self, link_id: int, when: datetime) -> None: ...

    @abstractmethod
    def mark_played(self, link_id: int, when: datetime, item: RouletteItemRow) -> None: ...


class UnitOfWork(ABC):
    """Transaction boundary shared by all repositories of one operation."""

    users: UserRepository
    roles: RoleRepository
    permissions: PermissionRepository
    categories: CategoryRepository
    products: ProductRepository
    suppliers: SupplierRepository
    branches: BranchRepository
    inventory: InventoryRepository
    stock_movements: StockMovementRepository
    sales: SaleRepository
    brands: BrandRepository
    models: DeviceModelRepository
    spare_parts: SparePartRepository
    work_orders: WorkOrderRepository
    affiliate_parts: AffiliatePartRepository
    page_visits: PageVisitRepository
    settings: SettingsRepository
    cash_openings: CashOpeningRepository
    whatsapp: WhatsAppRepository
    roulettes: RouletteRepository

    @abstractmethod
    def flush(self) -> None: ...

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def rollback(self) -> None: ...

    @contextmanager
    def transaction(self) -> Iterator["UnitOfWork"]:
        """Commit on success, ROLLBACK on any error."""
        try:
            yield self
            self.commit()
        except BaseException:
            self.rollback()
            raise
