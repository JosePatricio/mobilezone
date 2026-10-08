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
from app.domain.value_objects.affiliate_parts import AffiliatePartStatus, AffiliatePartType, PartCondition
from app.domain.value_objects.enums import SaleStatus
from app.domain.value_objects.pagination import Page, PageRequest

T = TypeVar("T")


class Repository(ABC, Generic[T]):
    @abstractmethod
    def add(self, entity: T) -> T: ...

    @abstractmethod
    def get(self, entity_id: int) -> T | None: ...

    @abstractmethod
    def delete(self, entity: T) -> None: ...


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
    def list(
        self,
        page: PageRequest,
        *,
        search: str | None = None,
        category_id: int | None = None,
        estado: bool | None = None,
    ) -> Page[Product]: ...


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
    def summary(self, *, user_id: int, desde: datetime, hasta: datetime) -> tuple[int, Decimal]:
        """Number of confirmed sales of the user in the range and the amount charged (total_pagar)."""


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


class WorkOrderRepository(Repository[WorkOrder]):
    @abstractmethod
    def reception_dates(self, *, desde: date, hasta: date) -> list[date]:
        """Reception date of every order received between ``desde`` and ``hasta`` (inclusive)."""

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


class DataResetRepository(ABC):
    @abstractmethod
    def delete_business_data(self, client_role: str) -> tuple[dict[str, int], list[str]]:
        """Deletes the business data (orders, sales, inventory, catalogs and clients).

        Returns the rows deleted per module and the stored files they referenced.
        """

    @abstractmethod
    def restart_numbering(self) -> None:
        """Order numbers, sale numbers, etc. start again from 1 (run after the commit)."""


class UnitOfWork(ABC):
    """Transaction boundary shared by all repositories of one operation."""

    users: UserRepository
    roles: RoleRepository
    permissions: PermissionRepository
    categories: CategoryRepository
    products: ProductRepository
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
    data_reset: DataResetRepository

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
