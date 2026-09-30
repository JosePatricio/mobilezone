from __future__ import annotations

from app.application.dto import ProductData, StockAdjustmentData
from app.application.services.files import FileStorage
from app.application.use_cases.base import CrudUseCases, UseCase
from app.application.use_cases.images import replace_image
from app.domain.entities import Product, StockMovement, User
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import Repository, UnitOfWork
from app.domain.value_objects.enums import StockMovementType
from app.domain.value_objects.pagination import Page, PageRequest


PRODUCT_IMAGES_FOLDER = "products"


class ProductUseCases(CrudUseCases[Product]):
    entity_label = "Producto"
    not_found_code = "PRODUCT_NOT_FOUND"

    def __init__(self, uow: UnitOfWork, storage: FileStorage | None = None) -> None:
        super().__init__(uow)
        self.storage = storage

    def _repo(self) -> Repository[Product]:
        return self.uow.products

    def list(
        self,
        page: PageRequest,
        search: str | None = None,
        category_id: int | None = None,
        estado: bool | None = None,
    ) -> Page[Product]:
        return self.uow.products.list(page, search=search, category_id=category_id, estado=estado)

    def _validate_category(self, category_id: int, allow_inactive: bool = False) -> None:
        category = self.uow.categories.get(category_id)
        if category is None:
            raise NotFoundError("Categoría no encontrada.", code="CATEGORY_NOT_FOUND")
        if not category.estado and not allow_inactive:
            raise ValidationError("La categoría seleccionada está inactiva.", code="CATEGORY_INACTIVE")

    def _build(self, data: ProductData) -> Product:
        return Product(
            category_id=data.category_id,
            sku=data.sku,
            nombre=data.nombre,
            precio_venta=data.precio_venta,
            precio_costo=data.precio_costo,
            precio_mayor=data.precio_mayor,
            descripcion=data.descripcion,
            estado=data.estado,
        )

    def _ensure_unique_sku(self, sku: str, current_id: int | None = None) -> None:
        existing = self.uow.products.get_by_sku(sku)
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe un producto con ese SKU.", code="SKU_ALREADY_EXISTS")

    def create(self, data: ProductData) -> Product:
        """New products start with stock 0 (stock is loaded with audited adjustments)."""
        with self.uow.transaction():
            self._validate_category(data.category_id)
            product = self._build(data)
            self._ensure_unique_sku(product.sku)
            self.uow.products.add(product)
        return product

    def update(self, product_id: int, data: ProductData) -> Product:
        with self.uow.transaction():
            product = self.get(product_id)
            self._validate_category(data.category_id, allow_inactive=data.category_id == product.category_id)
            changes = self._build(data)
            self._ensure_unique_sku(changes.sku, current_id=product.id)
            product.category_id, product.sku = changes.category_id, changes.sku
            product.nombre, product.descripcion = changes.nombre, changes.descripcion
            product.change_prices(changes.precio_venta, changes.precio_costo, changes.precio_mayor)
            product.estado = data.estado
        return product

    def delete(self, entity_id: int) -> None:
        imagen = self.get(entity_id).imagen
        super().delete(entity_id)
        if imagen and self.storage is not None:
            self.storage.delete(imagen)

    def set_image(self, product_id: int, content: bytes | None) -> Product:
        """Uploads (or with ``None`` removes) the product image."""
        assert self.storage is not None
        return replace_image(
            self.uow, self.storage, lambda: self.get(product_id), "imagen", PRODUCT_IMAGES_FOLDER, content
        )

    def stock_movements(self, product_id: int, page: PageRequest) -> Page[StockMovement]:
        self.get(product_id)
        return self.uow.stock_movements.list_by_product(product_id, page)


class UpdateProductStockUseCase(UseCase):
    """Manual stock adjustment (entry or exit), audited and transactional."""

    def execute(self, product_id: int, data: StockAdjustmentData, actor: User) -> Product:
        with self.uow.transaction():
            product = self.uow.products.get_for_update(product_id)
            if product is None:
                raise NotFoundError("Producto no encontrado.", code="PRODUCT_NOT_FOUND")
            product.adjust_stock(data.cantidad)
            self.uow.stock_movements.add(
                StockMovement(
                    product_id=product_id,
                    tipo=StockMovementType.AJUSTE,
                    cantidad=data.cantidad,
                    stock_resultante=product.stock,
                    user_id=actor.id,
                    motivo=(data.motivo or "").strip() or None,
                )
            )
        return product
