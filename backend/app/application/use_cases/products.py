from __future__ import annotations

from app.application.dto import CreateProductData, StockAdjustmentData, UpdateProductData
from app.application.use_cases.base import CrudUseCases, UseCase
from app.domain.entities import Product, StockMovement, User
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.repositories import Repository
from app.domain.value_objects.enums import StockMovementType
from app.domain.value_objects.pagination import Page, PageRequest


class ProductUseCases(CrudUseCases[Product]):
    entity_label = "Producto"
    not_found_code = "PRODUCT_NOT_FOUND"

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

    def create(self, data: CreateProductData, actor: User) -> Product:
        with self.uow.transaction():
            self._validate_category(data.category_id)
            product = Product(
                category_id=data.category_id,
                nombre=data.nombre,
                precio=data.precio,
                stock=data.stock,
                descripcion=data.descripcion,
                estado=data.estado,
            )
            self.uow.products.add(product)
            if product.stock > 0:
                self.uow.flush()
                self.uow.stock_movements.add(
                    StockMovement(
                        product_id=product.id,  # type: ignore[arg-type]
                        tipo=StockMovementType.AJUSTE,
                        cantidad=product.stock,
                        stock_resultante=product.stock,
                        user_id=actor.id,
                        motivo="Stock inicial",
                    )
                )
        return product

    def update(self, product_id: int, data: UpdateProductData) -> Product:
        with self.uow.transaction():
            product = self.get(product_id)
            self._validate_category(data.category_id, allow_inactive=data.category_id == product.category_id)
            normalized = Product(
                category_id=data.category_id, nombre=data.nombre, precio=data.precio, descripcion=data.descripcion
            )
            product.category_id = normalized.category_id
            product.nombre, product.descripcion = normalized.nombre, normalized.descripcion
            product.change_price(normalized.precio)
            product.estado = data.estado
        return product

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
