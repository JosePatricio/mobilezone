from __future__ import annotations

from decimal import Decimal

from app.application.dto import BalanceResult, WorkOrderData, WorkOrderFilters, WorkOrderSparePartData
from app.application.use_cases.base import UseCase, require_permission
from app.domain.entities import User, WorkOrder, WorkOrderSparePart, calculate_balance
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.enums import WorkOrderStatus
from app.domain.value_objects.pagination import Page, PageRequest
from app.domain.value_objects.permissions import Perm


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

    def _validate_client(self, cliente_id: int, current_id: int | None = None) -> None:
        client = self.uow.users.get(cliente_id)
        if client is None or not client.is_client:
            raise ValidationError("El cliente seleccionado no existe.", code="INVALID_CLIENT")
        if not client.estado and cliente_id != current_id:
            raise ValidationError("El cliente seleccionado está inactivo.", code="CLIENT_INACTIVE")

    def _validate_technician(self, tecnico_id: int) -> None:
        technician = self.uow.users.get(tecnico_id)
        if technician is None or not technician.is_technician:
            raise ValidationError("El técnico seleccionado no existe.", code="INVALID_TECHNICIAN")
        if not technician.estado:
            raise ValidationError("El técnico seleccionado está inactivo.", code="TECHNICIAN_INACTIVE")

    def _validate_device(self, marca_id: int, modelo_id: int) -> None:
        brand = self.uow.brands.get(marca_id)
        if brand is None:
            raise ValidationError("La marca seleccionada no existe.", code="BRAND_NOT_FOUND")
        model = self.uow.models.get(modelo_id)
        if model is None:
            raise ValidationError("El modelo seleccionado no existe.", code="MODEL_NOT_FOUND")
        if model.brand_id != marca_id:
            raise ValidationError("El modelo no pertenece a la marca seleccionada.", code="MODEL_BRAND_MISMATCH")

    def _resolve_technician(self, actor: User, requested: int | None, current: int | None, creating: bool) -> int | None:
        """Technician rules (spec §12, §23).

        * A technician creating an order without specifying one is assigned automatically.
        * A technician may always assign the order to themself.
        * Assigning anyone else (or unassigning) requires ``work_orders.assign_technician``;
          without it, omitting the technician on update keeps the current one.
        """
        can_assign = actor.has_permission(Perm.WORK_ORDERS_ASSIGN_TECHNICIAN)
        if creating and requested is None and actor.is_technician:
            return actor.id
        if not creating and (requested == current or (requested is None and not can_assign)):
            return current
        if requested is not None and requested == actor.id and actor.is_technician:
            return requested
        require_permission(actor, Perm.WORK_ORDERS_ASSIGN_TECHNICIAN)
        if requested is not None:
            self._validate_technician(requested)
        return requested


class CreateWorkOrderUseCase(_WorkOrderValidation):
    def execute(self, data: WorkOrderData, actor: User) -> WorkOrder:
        with self.uow.transaction():
            self._validate_client(data.cliente_id)
            self._validate_device(data.marca_id, data.modelo_id)
            tecnico_id = self._resolve_technician(actor, data.tecnico_id, None, creating=True)
            order = WorkOrder(
                user_id=actor.id,  # type: ignore[arg-type]
                cliente_id=data.cliente_id,
                tecnico_id=tecnico_id,
                marca_id=data.marca_id,
                modelo_id=data.modelo_id,
                observacion=data.observacion,
                estado=data.estado,
                garantia=data.garantia,
                color=data.color,
                presupuesto=data.presupuesto,
                anticipo=data.anticipo,
                fecha=data.fecha,
            )
            self.uow.work_orders.add(order)  # assigns num_orden
        return order


class UpdateWorkOrderUseCase(_WorkOrderValidation):
    def execute(self, work_order_id: int, data: WorkOrderData, actor: User) -> WorkOrder:
        with self.uow.transaction():
            order = _get_order(self.uow, work_order_id)
            self._validate_client(data.cliente_id, current_id=order.cliente_id)
            self._validate_device(data.marca_id, data.modelo_id)
            order.tecnico_id = self._resolve_technician(actor, data.tecnico_id, order.tecnico_id, creating=False)
            order.cliente_id = data.cliente_id
            order.marca_id, order.modelo_id = data.marca_id, data.modelo_id
            normalized = WorkOrder(
                user_id=order.user_id,
                cliente_id=data.cliente_id,
                marca_id=data.marca_id,
                modelo_id=data.modelo_id,
                observacion=data.observacion,
                color=data.color,
                estado=data.estado,
                presupuesto=data.presupuesto,
                anticipo=data.anticipo,
            )
            order.observacion, order.color = normalized.observacion, normalized.color
            order.garantia = bool(data.garantia)
            order.change_status(data.estado)
            order.set_amounts(data.presupuesto, data.anticipo)
            if data.fecha is not None:
                order.fecha = data.fecha
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
