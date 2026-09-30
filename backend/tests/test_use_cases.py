"""Use case tests against a real Unit of Work on the MySQL test database."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.application.dto import (
    ConfirmSaleData,
    SaleItemData,
    StockAdjustmentData,
    WorkOrderData,
    WorkOrderSparePartData,
)
from app.application.use_cases.products import UpdateProductStockUseCase
from app.application.use_cases.sales import CancelSaleUseCase, ConfirmSaleUseCase
from app.application.use_cases.work_orders import (
    AddSparePartToWorkOrderUseCase,
    CreateWorkOrderUseCase,
    UpdateWorkOrderUseCase,
)
from app.domain.exceptions import InsufficientStockError, NotFoundError, PermissionDeniedError, ValidationError
from app.domain.value_objects.enums import SaleStatus, StockMovementType, SystemRole
from app.domain.value_objects.pagination import PageRequest


def reload(uow, repo_name, entity_id):
    # Ends the current transaction (fresh REPEATABLE READ snapshot in MySQL) and expires the identity map.
    uow.rollback()
    return getattr(uow, repo_name).get(entity_id)


class TestConfirmSale:
    def test_sufficient_stock(self, uow, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        product = factory.product(precio="10.00", stock=10)
        sale = ConfirmSaleUseCase(uow).execute(ConfirmSaleData([SaleItemData(product.id, 3)]), seller)
        assert sale.total == Decimal("30.00")
        assert sale.estado == SaleStatus.CONFIRMADA
        assert reload(uow, "products", product.id).stock == 7

    def test_multiple_products_and_merged_lines(self, uow, factory):
        seller = factory.user()
        a = factory.product(precio="10.00", stock=5)
        b = factory.product(precio="25.00", stock=5)
        items = [SaleItemData(a.id, 1), SaleItemData(b.id, 1), SaleItemData(a.id, 1)]
        sale = ConfirmSaleUseCase(uow).execute(ConfirmSaleData(items), seller)
        assert sale.total == Decimal("45.00")
        assert len(sale.details) == 2
        assert reload(uow, "products", a.id).stock == 3
        assert reload(uow, "products", b.id).stock == 4

    def test_insufficient_stock_rolls_back_everything(self, uow, factory):
        seller = factory.user()
        a = factory.product(stock=5)
        b = factory.product(stock=1)
        with pytest.raises(InsufficientStockError):
            ConfirmSaleUseCase(uow).execute(ConfirmSaleData([SaleItemData(a.id, 2), SaleItemData(b.id, 2)]), seller)
        assert reload(uow, "products", a.id).stock == 5
        assert reload(uow, "products", b.id).stock == 1
        assert uow.sales.list(PageRequest()).total == 0

    def test_historical_price_is_kept(self, uow, factory):
        seller = factory.user()
        product = factory.product(precio="10.00")
        sale = ConfirmSaleUseCase(uow).execute(ConfirmSaleData([SaleItemData(product.id, 1)]), seller)
        with uow.transaction():
            reload(uow, "products", product.id).change_prices(Decimal("99.00"), Decimal("50"), Decimal("90"))
        assert reload(uow, "sales", sale.id).details[0].precio_unitario == Decimal("10.00")

    def test_inactive_product_rejected(self, uow, factory):
        seller = factory.user()
        product = factory.product(estado=False)
        with pytest.raises(ValidationError):
            ConfirmSaleUseCase(uow).execute(ConfirmSaleData([SaleItemData(product.id, 1)]), seller)

    def test_unknown_product(self, uow, factory):
        with pytest.raises(NotFoundError):
            ConfirmSaleUseCase(uow).execute(ConfirmSaleData([SaleItemData(999, 1)]), factory.user())

    def test_cancel_restores_stock_and_audits(self, uow, factory):
        seller = factory.user()
        product = factory.product(stock=4)
        sale = ConfirmSaleUseCase(uow).execute(ConfirmSaleData([SaleItemData(product.id, 3)]), seller)
        CancelSaleUseCase(uow).execute(sale.id, seller)
        assert reload(uow, "products", product.id).stock == 4
        movements = uow.stock_movements.list_by_product(product.id, PageRequest()).items
        assert {m.tipo for m in movements} >= {StockMovementType.VENTA, StockMovementType.ANULACION_VENTA}


def test_manual_stock_adjustment_never_negative(uow, factory):
    actor = factory.user(SystemRole.ADMIN)
    product = factory.product(stock=2)
    UpdateProductStockUseCase(uow).execute(product.id, StockAdjustmentData(cantidad=5, motivo="Compra"), actor)
    assert reload(uow, "products", product.id).stock == 7
    with pytest.raises(InsufficientStockError):
        UpdateProductStockUseCase(uow).execute(product.id, StockAdjustmentData(cantidad=-8), actor)
    assert reload(uow, "products", product.id).stock == 7


class TestWorkOrders:
    def _data(self, factory, **overrides) -> WorkOrderData:
        client = factory.user(SystemRole.CLIENTE)
        brand, model = factory.brand_and_model()
        values = dict(
            cliente_id=client.id,
            marca_id=brand.id,
            modelo_id=model.id,
            presupuesto=Decimal("100"),
            anticipo=Decimal("30"),
        )
        values.update(overrides)
        return WorkOrderData(**values)

    def test_technician_is_auto_assigned_and_saldo_computed(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        order = CreateWorkOrderUseCase(uow).execute(self._data(factory), tech)
        assert order.num_orden is not None
        assert order.user_id == tech.id
        assert order.tecnico_id == tech.id
        assert order.saldo == Decimal("70.00")

    def test_num_orden_is_unique_and_incremental(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        first = CreateWorkOrderUseCase(uow).execute(self._data(factory), tech)
        second = CreateWorkOrderUseCase(uow).execute(self._data(factory), tech)
        assert second.num_orden > first.num_orden

    def test_client_must_be_a_client(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        with pytest.raises(ValidationError) as exc:
            CreateWorkOrderUseCase(uow).execute(self._data(factory, cliente_id=tech.id), tech)
        assert exc.value.code == "INVALID_CLIENT"

    def test_model_must_belong_to_brand(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        _, other_model = factory.brand_and_model()
        with pytest.raises(ValidationError) as exc:
            CreateWorkOrderUseCase(uow).execute(self._data(factory, modelo_id=other_model.id), tech)
        assert exc.value.code == "MODEL_BRAND_MISMATCH"

    def test_technician_cannot_assign_other_technician(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        other = factory.user(SystemRole.TECNICO)
        with pytest.raises(PermissionDeniedError):
            CreateWorkOrderUseCase(uow).execute(self._data(factory, tecnico_id=other.id), tech)

    def test_authorized_user_assigns_technician(self, uow, factory):
        clerk = factory.user(SystemRole.ADMIN)  # has work_orders.assign_technician
        tech = factory.user(SystemRole.TECNICO)
        order = CreateWorkOrderUseCase(uow).execute(self._data(factory, tecnico_id=tech.id), clerk)
        assert order.tecnico_id == tech.id
        assert order.user_id == clerk.id

    def test_assigned_user_must_be_technician(self, uow, factory):
        clerk = factory.user(SystemRole.ADMIN)
        with pytest.raises(ValidationError) as exc:
            CreateWorkOrderUseCase(uow).execute(self._data(factory, tecnico_id=clerk.id), clerk)
        assert exc.value.code == "INVALID_TECHNICIAN"

    def test_update_recomputes_saldo(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        data = self._data(factory)
        order = CreateWorkOrderUseCase(uow).execute(data, tech)
        updated = UpdateWorkOrderUseCase(uow).execute(
            order.id,
            WorkOrderData(**{**data.__dict__, "presupuesto": Decimal("200"), "anticipo": Decimal("50"), "estado": 1}),
            tech,
        )
        assert updated.saldo == Decimal("150.00")
        assert updated.estado == 1

    def test_add_spare_part_registers_authenticated_technician(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        order = CreateWorkOrderUseCase(uow).execute(self._data(factory), tech)
        part = factory.spare_part(precio="85.00")
        item = AddSparePartToWorkOrderUseCase(uow).execute(
            order.id, WorkOrderSparePartData(spare_part_id=part.id, cantidad=1), tech
        )
        assert item.technician_id == tech.id
        assert item.precio == Decimal("85.00")
        assert len(reload(uow, "work_orders", order.id).spare_parts) == 1

    def test_inactive_spare_part_rejected(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        order = CreateWorkOrderUseCase(uow).execute(self._data(factory), tech)
        part = factory.spare_part(estado=False)
        with pytest.raises(ValidationError):
            AddSparePartToWorkOrderUseCase(uow).execute(
                order.id, WorkOrderSparePartData(spare_part_id=part.id, cantidad=1), tech
            )
