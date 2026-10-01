from __future__ import annotations

import secrets
from datetime import datetime, timezone, tzinfo
from decimal import Decimal

from app.application.dto import (
    BalanceResult,
    WorkOrderClientData,
    WorkOrderData,
    WorkOrderFilters,
    WorkOrderSparePartData,
)
from app.application.services.files import FileStorage, validate_image
from app.application.use_cases.base import UseCase
from app.domain.entities import User, WorkOrder, WorkOrderPhoto, WorkOrderSparePart, calculate_balance
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.enums import SystemRole, WorkOrderStatus
from app.domain.entities.base import optional_text
from app.domain.entities.user import normalize_celular
from app.domain.value_objects.identificacion import normalize_identificacion
from app.domain.value_objects.pagination import Page, PageRequest
from app.domain.value_objects.work_orders import validate_warranty_days


class CalculateWorkOrderBalanceUseCase:
    """saldo = presupuesto - anticipo (validated). Stateless."""

    def execute(self, presupuesto: Decimal, anticipo: Decimal) -> BalanceResult:
        p, a, s = calculate_balance(presupuesto, anticipo)
        return BalanceResult(presupuesto=p, anticipo=a, saldo=s)


def _get_order(uow: UnitOfWork, work_order_id: int) -> WorkOrder:
    order = uow.work_orders.get(work_order_id)
    if order is None:
        raise NotFoundError("Orden de trabajo no encontrada.", code="WORK_ORDER_NOT_FOUND")
    return order


class _WorkOrderValidation(UseCase):
    """Validates the differentiated user references and catalog references."""

    def _resolve_client(self, data: WorkOrderClientData) -> User:
        """Finds the client by cédula / RUC or registers it (role CLIENTE, no password).

        An existing client keeps its names; its phone is completed when it had none.
        """
        identificacion = normalize_identificacion(data.identificacion)
        if identificacion is None:
            raise ValidationError(
                "Ingrese la cédula o RUC del cliente.", code="REQUIRED_FIELD", details={"field": "cliente.identificacion"}
            )
        same_person = self.uow.users.find_same_person(identificacion)
        existing = next((u for u in same_person if u.identificacion == identificacion), None)
        if existing is None and same_person:
            other = same_person[0]
            raise ConflictError(
                f"La cédula / RUC corresponde a {other.nombre_completo} ({other.identificacion}).",
                code="IDENTIFICATION_ALREADY_EXISTS",
                details={"field": "cliente.identificacion"},
            )
        if existing is not None:
            if not existing.is_client:
                raise ValidationError(
                    "La cédula / RUC pertenece a un usuario que no es cliente.",
                    code="INVALID_CLIENT",
                    details={"field": "cliente.identificacion"},
                )
            if not existing.estado:
                raise ValidationError("El cliente está inactivo.", code="CLIENT_INACTIVE")
            if data.celular and not existing.celular:
                existing.celular = normalize_celular(data.celular)
            if data.email and not existing.email:
                existing.email = self._unique_email(data.email)
            return existing
        role = self.uow.roles.get_by_nombre(SystemRole.CLIENTE.value)
        client = User(
            nombre=data.nombre,
            apellido=data.apellido,
            identificacion=identificacion,
            celular=data.celular,
            email=self._unique_email(data.email) if data.email else None,
            rol_id=role.id if role else None,
        )
        self.uow.users.add(client)
        self.uow.flush()
        return client

    def _unique_email(self, email: str) -> str:
        """Email of the client (optional); it cannot belong to another user."""
        value = email.strip().lower()
        if self.uow.users.get_by_email(value) is not None:
            raise ConflictError(
                "Ya existe un usuario con ese email.", code="EMAIL_ALREADY_EXISTS", details={"field": "cliente.email"}
            )
        return value

    def _apply(self, order: WorkOrder, data: WorkOrderData) -> None:
        """Fields shared by create and update, validated by the entity rules."""
        order.set_entry(data.motivo_ingreso, data.tipo_display)
        order.set_lock(data.bloqueo_tipo, data.bloqueo_valor)
        order.garantia_dias = validate_warranty_days(data.garantia_dias)
        order.fecha_entrega = data.fecha_entrega
        order.modelo_tecnico = optional_text(data.modelo_tecnico)

    def _validate_device(self, marca_id: int, modelo_id: int) -> None:
        brand = self.uow.brands.get(marca_id)
        if brand is None:
            raise ValidationError("La marca seleccionada no existe.", code="BRAND_NOT_FOUND")
        model = self.uow.models.get(modelo_id)
        if model is None:
            raise ValidationError("El modelo seleccionado no existe.", code="MODEL_NOT_FOUND")
        if model.brand_id != marca_id:
            raise ValidationError("El modelo no pertenece a la marca seleccionada.", code="MODEL_BRAND_MISMATCH")


class CreateWorkOrderUseCase(_WorkOrderValidation):
    """The logged user registers the order and is its technician; the date is today (shop time zone)."""

    def __init__(self, uow: UnitOfWork, tz: tzinfo = timezone.utc) -> None:
        super().__init__(uow)
        self.tz = tz

    def execute(self, data: WorkOrderData, actor: User) -> WorkOrder:
        with self.uow.transaction():
            client = self._resolve_client(data.cliente)
            self._validate_device(data.marca_id, data.modelo_id)
            order = WorkOrder(
                user_id=actor.id,  # type: ignore[arg-type]  # user who generates the order
                cliente_id=client.id,  # type: ignore[arg-type]
                tecnico_id=actor.id,  # the logged user is the technician
                marca_id=data.marca_id,
                modelo_id=data.modelo_id,
                motivo_ingreso=data.motivo_ingreso,  # type: ignore[arg-type]
                tipo_display=data.tipo_display,  # type: ignore[arg-type]
                observacion=data.observacion,
                estado=data.estado,
                color=data.color,
                presupuesto=data.presupuesto,
                anticipo=data.anticipo,
                fecha=datetime.now(self.tz).date(),
                codigo_publico=secrets.token_hex(12),  # unguessable code for the public status page (QR)
            )
            self._apply(order, data)
            self.uow.work_orders.add(order)  # assigns num_orden
        return order


class UpdateWorkOrderUseCase(_WorkOrderValidation):
    def execute(self, work_order_id: int, data: WorkOrderData, actor: User) -> WorkOrder:
        with self.uow.transaction():
            order = _get_order(self.uow, work_order_id)
            client = self._resolve_client(data.cliente)
            self._validate_device(data.marca_id, data.modelo_id)
            order.cliente_id = client.id  # type: ignore[assignment]
            order.marca_id, order.modelo_id = data.marca_id, data.modelo_id
            normalized = WorkOrder(
                user_id=order.user_id,
                cliente_id=order.cliente_id,
                marca_id=data.marca_id,
                modelo_id=data.modelo_id,
                motivo_ingreso=data.motivo_ingreso,  # type: ignore[arg-type]
                tipo_display=data.tipo_display,  # type: ignore[arg-type]
                observacion=data.observacion,
                color=data.color,
                estado=data.estado,
                presupuesto=data.presupuesto,
                anticipo=data.anticipo,
            )
            order.observacion, order.color = normalized.observacion, normalized.color
            self._apply(order, data)
            order.change_status(data.estado)
            order.set_amounts(data.presupuesto, data.anticipo)
        return order


class ChangeWorkOrderStatusUseCase(UseCase):
    def execute(self, work_order_id: int, estado: int) -> WorkOrder:
        with self.uow.transaction():
            order = _get_order(self.uow, work_order_id)
            order.change_status(estado)
        return order


class AddSparePartToWorkOrderUseCase(UseCase):
    """Registers a spare part in an order. The authenticated user is the technician."""

    def execute(self, work_order_id: int, data: WorkOrderSparePartData, actor: User) -> WorkOrderSparePart:
        with self.uow.transaction():
            order = _get_order(self.uow, work_order_id)
            part = self.uow.spare_parts.get(data.spare_part_id)
            if part is None:
                raise NotFoundError("Repuesto no encontrado.", code="SPARE_PART_NOT_FOUND")
            if not part.estado:
                raise ValidationError("El repuesto seleccionado está inactivo.", code="SPARE_PART_INACTIVE")
            item = WorkOrderSparePart(
                spare_part_id=part.id,  # type: ignore[arg-type]
                technician_id=actor.id,  # type: ignore[arg-type]
                cantidad=data.cantidad,
                precio=data.precio if data.precio is not None else part.precio,
            )
            order.add_spare_part(item)
        return item


class RemoveSparePartFromWorkOrderUseCase(UseCase):
    def execute(self, work_order_id: int, item_id: int) -> None:
        with self.uow.transaction():
            order = _get_order(self.uow, work_order_id)
            order.remove_spare_part(item_id)


class WorkOrderQueries(UseCase):
    def get(self, work_order_id: int) -> WorkOrder:
        return _get_order(self.uow, work_order_id)

    def get_by_num_orden(self, num_orden: int) -> WorkOrder:
        order = self.uow.work_orders.get_by_num_orden(num_orden)
        if order is None:
            raise NotFoundError("Orden de trabajo no encontrada.", code="WORK_ORDER_NOT_FOUND")
        return order

    def list(self, page: PageRequest, filters: WorkOrderFilters) -> Page[WorkOrder]:
        if filters.estado is not None:
            WorkOrderStatus.parse(filters.estado)
        return self.uow.work_orders.list(
            page,
            num_orden=filters.num_orden,
            cliente=filters.cliente,
            cliente_id=filters.cliente_id,
            tecnico_id=filters.tecnico_id,
            estado=filters.estado,
            fecha_desde=filters.fecha_desde,
            fecha_hasta=filters.fecha_hasta,
        )


WORK_ORDER_PHOTOS_FOLDER = "work_orders"


class AddWorkOrderPhotoUseCase(UseCase):
    """Adds a photo of the device (JPG / PNG / WEBP, max 2 MB, up to 3 per order)."""

    def __init__(self, uow: UnitOfWork, storage: FileStorage) -> None:
        super().__init__(uow)
        self.storage = storage

    def execute(self, work_order_id: int, content: bytes) -> WorkOrderPhoto:
        extension = validate_image(content)
        _get_order(self.uow, work_order_id)
        path = self.storage.save(WORK_ORDER_PHOTOS_FOLDER, content, extension)
        try:
            with self.uow.transaction():
                order = _get_order(self.uow, work_order_id)
                photo = order.add_photo(WorkOrderPhoto(ruta=path))
        except BaseException:
            self.storage.delete(path)
            raise
        return photo


class RemoveWorkOrderPhotoUseCase(UseCase):
    def __init__(self, uow: UnitOfWork, storage: FileStorage) -> None:
        super().__init__(uow)
        self.storage = storage

    def execute(self, work_order_id: int, photo_id: int) -> None:
        with self.uow.transaction():
            photo = _get_order(self.uow, work_order_id).remove_photo(photo_id)
        self.storage.delete(photo.ruta)


class PublicWorkOrderStatusUseCase(UseCase):
    """Status of an order for the public page opened from the QR (no authentication)."""

    def execute(self, codigo_publico: str) -> WorkOrder:
        order = self.uow.work_orders.get_by_codigo_publico(codigo_publico.strip()) if codigo_publico else None
        if order is None:
            raise NotFoundError("Orden de trabajo no encontrada.", code="WORK_ORDER_NOT_FOUND")
        return order
