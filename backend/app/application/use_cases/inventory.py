"""Inventory (stock per branch) and branches (sucursales)."""
from __future__ import annotations

from app.application.dto import BranchData, InventoryData, StockAdjustmentData
from app.application.use_cases.base import CrudUseCases
from app.domain.entities import Branch, Inventory, StockMovement, User
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import Repository
from app.domain.value_objects.enums import StockMovementType
from app.domain.value_objects.pagination import Page, PageRequest


class BranchUseCases(CrudUseCases[Branch]):
    entity_label = "Sucursal"
    not_found_code = "BRANCH_NOT_FOUND"

    def _repo(self) -> Repository[Branch]:
        return self.uow.branches

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[Branch]:
        return self.uow.branches.list(page, search=search, estado=estado)

    def _ensure_unique(self, nombre: str, current_id: int | None = None) -> None:
        existing = self.uow.branches.get_by_nombre(nombre)
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe una sucursal con ese nombre.", code="BRANCH_ALREADY_EXISTS")

    def create(self, data: BranchData) -> Branch:
        with self.uow.transaction():
            branch = Branch(nombre=data.nombre, ubicacion=data.ubicacion, telefono=data.telefono, estado=data.estado)
            self._ensure_unique(branch.nombre)
            self.uow.branches.add(branch)
        return branch

    def update(self, branch_id: int, data: BranchData) -> Branch:
        with self.uow.transaction():
            branch = self.get(branch_id)
            changes = Branch(nombre=data.nombre, ubicacion=data.ubicacion, telefono=data.telefono)
            self._ensure_unique(changes.nombre, current_id=branch.id)
            branch.nombre, branch.ubicacion, branch.telefono = changes.nombre, changes.ubicacion, changes.telefono
            branch.estado = data.estado
        return branch


class InventoryUseCases(CrudUseCases[Inventory]):
    """Stock of each product in each branch. Every stock change is audited in ``stock_movements``."""

    entity_label = "Inventario"
    not_found_code = "INVENTORY_NOT_FOUND"

    def _repo(self) -> Repository[Inventory]:
        return self.uow.inventory

    def list(
        self,
        page: PageRequest,
        search: str | None = None,
        branch_id: int | None = None,
        product_id: int | None = None,
        with_stock: bool | None = None,
        active_products: bool | None = None,
    ) -> Page[Inventory]:
        return self.uow.inventory.list(
            page,
            search=search,
            branch_id=branch_id,
            product_id=product_id,
            with_stock=with_stock,
            active_products=active_products,
        )

    def create(self, data: InventoryData, actor: User) -> Inventory:
        """Registers a product in a branch, optionally with initial stock (audited as an adjustment)."""
        with self.uow.transaction():
            if self.uow.products.get(data.product_id) is None:
                raise NotFoundError("Producto no encontrado.", code="PRODUCT_NOT_FOUND")
            branch = self.uow.branches.get(data.branch_id)
            if branch is None:
                raise NotFoundError("Sucursal no encontrada.", code="BRANCH_NOT_FOUND")
            if not branch.estado:
                raise ValidationError("La sucursal seleccionada está inactiva.", code="BRANCH_INACTIVE")
            if self.uow.inventory.get_by_product_and_branch(data.product_id, data.branch_id) is not None:
                raise ConflictError(
                    "El producto ya está registrado en esa sucursal.", code="INVENTORY_ALREADY_EXISTS"
                )
            inventory = Inventory(product_id=data.product_id, branch_id=data.branch_id, stock=data.stock)
            self.uow.inventory.add(inventory)
            if inventory.stock > 0:
                self.uow.flush()
                self.uow.stock_movements.add(
                    StockMovement(
                        product_id=inventory.product_id,
                        inventory_id=inventory.id,
                        tipo=StockMovementType.AJUSTE,
                        cantidad=inventory.stock,
                        stock_resultante=inventory.stock,
                        user_id=actor.id,
                        motivo="Stock inicial",
                    )
                )
        return inventory

    def adjust_stock(self, inventory_id: int, data: StockAdjustmentData, actor: User) -> Inventory:
        """Manual entry (+) or exit (-) of units; stock can never become negative."""
        with self.uow.transaction():
            inventory = self.uow.inventory.get_for_update(inventory_id)
            if inventory is None:
                raise NotFoundError("Inventario no encontrado.", code=self.not_found_code)
            inventory.adjust_stock(data.cantidad)
            self.uow.stock_movements.add(
                StockMovement(
                    product_id=inventory.product_id,
                    inventory_id=inventory.id,
                    tipo=StockMovementType.AJUSTE,
                    cantidad=data.cantidad,
                    stock_resultante=inventory.stock,
                    user_id=actor.id,
                    motivo=(data.motivo or "").strip() or None,
                )
            )
        return inventory

    def delete(self, entity_id: int) -> None:
        if self.get(entity_id).stock > 0:
            raise ConflictError(
                "Solo se puede quitar un producto de la sucursal cuando su stock es 0.", code="INVENTORY_HAS_STOCK"
            )
        super().delete(entity_id)

    def movements(self, inventory_id: int, page: PageRequest) -> Page[StockMovement]:
        self.get(inventory_id)
        return self.uow.stock_movements.list_by_inventory(inventory_id, page)
