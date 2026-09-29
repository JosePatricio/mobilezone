"""Use cases for simple catalogs: categories, brands, device models and spare parts."""
from __future__ import annotations

from app.application.dto import CatalogData, DeviceModelData, SparePartData
from app.application.use_cases.base import CrudUseCases
from app.domain.entities import Brand, Category, DeviceModel, SparePart
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import Repository
from app.domain.value_objects.pagination import Page, PageRequest


class CategoryUseCases(CrudUseCases[Category]):
    entity_label = "Categoría"
    not_found_code = "CATEGORY_NOT_FOUND"

    def _repo(self) -> Repository[Category]:
        return self.uow.categories

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[Category]:
        return self.uow.categories.list(page, search=search, estado=estado)

    def _ensure_unique(self, nombre: str, current_id: int | None = None) -> None:
        existing = self.uow.categories.get_by_nombre(nombre)
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe una categoría con ese nombre.", code="CATEGORY_ALREADY_EXISTS")

    def create(self, data: CatalogData) -> Category:
        with self.uow.transaction():
            category = Category(nombre=data.nombre, descripcion=data.descripcion, estado=data.estado)
            self._ensure_unique(category.nombre)
            self.uow.categories.add(category)
        return category

    def update(self, category_id: int, data: CatalogData) -> Category:
        with self.uow.transaction():
            category = self.get(category_id)
            normalized = Category(nombre=data.nombre, descripcion=data.descripcion)
            self._ensure_unique(normalized.nombre, current_id=category.id)
            category.nombre, category.descripcion = normalized.nombre, normalized.descripcion
            category.estado = data.estado
        return category


class BrandUseCases(CrudUseCases[Brand]):
    entity_label = "Marca"
    not_found_code = "BRAND_NOT_FOUND"

    def _repo(self) -> Repository[Brand]:
        return self.uow.brands

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[Brand]:
        return self.uow.brands.list(page, search=search, estado=estado)

    def _ensure_unique(self, nombre: str, current_id: int | None = None) -> None:
        existing = self.uow.brands.get_by_nombre(nombre)
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe una marca con ese nombre.", code="BRAND_ALREADY_EXISTS")

    def create(self, data: CatalogData) -> Brand:
        with self.uow.transaction():
            brand = Brand(nombre=data.nombre, descripcion=data.descripcion, estado=data.estado)
            self._ensure_unique(brand.nombre)
            self.uow.brands.add(brand)
        return brand

    def update(self, brand_id: int, data: CatalogData) -> Brand:
        with self.uow.transaction():
            brand = self.get(brand_id)
            normalized = Brand(nombre=data.nombre, descripcion=data.descripcion)
            self._ensure_unique(normalized.nombre, current_id=brand.id)
            brand.nombre, brand.descripcion = normalized.nombre, normalized.descripcion
            brand.estado = data.estado
        return brand


class DeviceModelUseCases(CrudUseCases[DeviceModel]):
    entity_label = "Modelo"
    not_found_code = "MODEL_NOT_FOUND"

    def _repo(self) -> Repository[DeviceModel]:
        return self.uow.models

    def list(
        self,
        page: PageRequest,
        search: str | None = None,
        brand_id: int | None = None,
        estado: bool | None = None,
    ) -> Page[DeviceModel]:
        return self.uow.models.list(page, search=search, brand_id=brand_id, estado=estado)

    def _validate(self, model: DeviceModel, current_id: int | None = None) -> None:
        brand = self.uow.brands.get(model.brand_id)
        if brand is None:
            raise NotFoundError("Marca no encontrada.", code="BRAND_NOT_FOUND")
        if not brand.estado and current_id is None:
            raise ValidationError("La marca seleccionada está inactiva.", code="BRAND_INACTIVE")
        existing = self.uow.models.get_by_brand_and_nombre(model.brand_id, model.nombre)
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe ese modelo para la marca.", code="MODEL_ALREADY_EXISTS")

    def create(self, data: DeviceModelData) -> DeviceModel:
        with self.uow.transaction():
            model = DeviceModel(
                brand_id=data.brand_id, nombre=data.nombre, descripcion=data.descripcion, estado=data.estado
            )
            self._validate(model)
            self.uow.models.add(model)
        return model

    def update(self, model_id: int, data: DeviceModelData) -> DeviceModel:
        with self.uow.transaction():
            model = self.get(model_id)
            normalized = DeviceModel(brand_id=data.brand_id, nombre=data.nombre, descripcion=data.descripcion)
            self._validate(normalized, current_id=model.id)
            model.brand_id, model.nombre = normalized.brand_id, normalized.nombre
            model.descripcion, model.estado = normalized.descripcion, data.estado
        return model


class SparePartUseCases(CrudUseCases[SparePart]):
    entity_label = "Repuesto"
    not_found_code = "SPARE_PART_NOT_FOUND"

    def _repo(self) -> Repository[SparePart]:
        return self.uow.spare_parts

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[SparePart]:
        return self.uow.spare_parts.list(page, search=search, estado=estado)

    def create(self, data: SparePartData) -> SparePart:
        with self.uow.transaction():
            part = SparePart(
                tipo=data.tipo,
                precio=data.precio,
                ubicacion=data.ubicacion,
                garantia=data.garantia,
                estado=data.estado,
            )
            self.uow.spare_parts.add(part)
        return part

    def update(self, part_id: int, data: SparePartData) -> SparePart:
        with self.uow.transaction():
            part = self.get(part_id)
            normalized = SparePart(tipo=data.tipo, precio=data.precio, ubicacion=data.ubicacion, garantia=data.garantia)
            part.tipo, part.precio = normalized.tipo, normalized.precio
            part.ubicacion, part.garantia = normalized.ubicacion, normalized.garantia
            part.estado = data.estado
        return part
