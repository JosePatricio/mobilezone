"""Use case tests against a real Unit of Work on the MySQL test database."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.application.dto import (
    ConfirmSaleData,
    WorkOrderClientData,
    SaleItemData,
    StockAdjustmentData,
    WorkOrderData,
    WorkOrderSparePartData,
)
from app.application.use_cases.inventory import InventoryUseCases
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


def sale(inv_or_items, branch_id: int, **kw) -> ConfirmSaleData:
    return ConfirmSaleData(branch_id=branch_id, items=inv_or_items, **kw)


class TestConfirmSale:
    def test_sufficient_stock_discounts_branch_inventory(self, uow, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        inv = factory.inventory(precio="10.00", stock=10)
        result = ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 3)], inv.branch_id), seller)
        assert result.total == Decimal("30.00")
        assert result.estado == SaleStatus.CONFIRMADA
        assert result.details[0].inventory_id == inv.id
        assert reload(uow, "inventory", inv.id).stock == 7
        assert reload(uow, "products", inv.product_id).stock_total == 7

    def test_multiple_products_and_merged_lines(self, uow, factory):
        seller = factory.user()
        a = factory.inventory(precio="10.00", stock=5)
        b = factory.inventory(precio="25.00", stock=5)
        items = [SaleItemData(a.id, 1), SaleItemData(b.id, 1), SaleItemData(a.id, 1)]
        result = ConfirmSaleUseCase(uow).execute(sale(items, a.branch_id), seller)
        assert result.total == Decimal("45.00")
        assert len(result.details) == 2
        assert reload(uow, "inventory", a.id).stock == 3
        assert reload(uow, "inventory", b.id).stock == 4

    def test_only_the_sale_branch_is_discounted(self, uow, factory):
        other = factory.branch()
        seller = factory.user(SystemRole.VENDEDOR, branches=[factory.default_branch, other])
        product = factory.product(stock=5)  # Matriz
        other_inv = factory.stock_of(product, 8, other)
        ConfirmSaleUseCase(uow).execute(sale([SaleItemData(other_inv.id, 2)], other.id), seller)
        assert reload(uow, "inventory", other_inv.id).stock == 6
        assert reload(uow, "products", product.id).stock_total == 11  # 5 in Matriz + 6

    def test_item_from_another_branch_is_rejected(self, uow, factory):
        other = factory.branch()
        seller = factory.user(SystemRole.VENDEDOR, branches=[factory.default_branch, other])
        inv = factory.inventory(stock=5)  # Matriz
        with pytest.raises(NotFoundError) as exc:
            ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 1)], other.id), seller)
        assert exc.value.code == "INVENTORY_NOT_FOUND"

    def test_seller_must_be_assigned_to_the_branch(self, uow, factory):
        other = factory.branch()
        seller = factory.user(SystemRole.VENDEDOR)  # only Matriz
        inv = factory.inventory(stock=5, branch=other)
        with pytest.raises(PermissionDeniedError) as exc:
            ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 1)], other.id), seller)
        assert exc.value.code == "BRANCH_NOT_ASSIGNED"
        admin = factory.user(SystemRole.ADMIN)  # branches.any
        ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 1)], other.id), admin)

    def test_insufficient_stock_rolls_back_everything(self, uow, factory):
        seller = factory.user()
        a = factory.inventory(stock=5)
        b = factory.inventory(stock=1)
        with pytest.raises(InsufficientStockError):
            ConfirmSaleUseCase(uow).execute(sale([SaleItemData(a.id, 2), SaleItemData(b.id, 2)], a.branch_id), seller)
        assert reload(uow, "inventory", a.id).stock == 5
        assert reload(uow, "inventory", b.id).stock == 1
        assert uow.sales.list(PageRequest()).total == 0

    def test_historical_price_is_kept(self, uow, factory):
        seller = factory.user()
        inv = factory.inventory(precio="10.00")
        result = ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 1)], inv.branch_id), seller)
        with uow.transaction():
            reload(uow, "products", inv.product_id).change_prices(Decimal("99.00"), Decimal("50"), Decimal("90"))
        assert reload(uow, "sales", result.id).details[0].precio_unitario == Decimal("10.00")

    def test_inactive_product_rejected(self, uow, factory):
        seller = factory.user()
        inv = factory.inventory(estado=False)
        with pytest.raises(ValidationError):
            ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 1)], inv.branch_id), seller)

    def test_unknown_inventory(self, uow, factory):
        with pytest.raises(NotFoundError):
            ConfirmSaleUseCase(uow).execute(sale([SaleItemData(999, 1)], factory.default_branch.id), factory.user())

    def test_cancel_restores_stock_and_audits(self, uow, factory):
        seller = factory.user()
        inv = factory.inventory(stock=4)
        result = ConfirmSaleUseCase(uow).execute(sale([SaleItemData(inv.id, 3)], inv.branch_id), seller)
        CancelSaleUseCase(uow).execute(result.id, seller)
        assert reload(uow, "inventory", inv.id).stock == 4
        movements = uow.stock_movements.list_by_inventory(inv.id, PageRequest()).items
        assert {m.tipo for m in movements} >= {StockMovementType.VENTA, StockMovementType.ANULACION_VENTA}


def test_manual_stock_adjustment_never_negative(uow, factory):
    actor = factory.user(SystemRole.ADMIN)
    inv = factory.inventory(stock=2)
    InventoryUseCases(uow).adjust_stock(inv.id, StockAdjustmentData(cantidad=5, motivo="Compra"), actor)
    assert reload(uow, "inventory", inv.id).stock == 7
    with pytest.raises(InsufficientStockError):
        InventoryUseCases(uow).adjust_stock(inv.id, StockAdjustmentData(cantidad=-8), actor)
    assert reload(uow, "inventory", inv.id).stock == 7


class TestWorkOrders:
    def _data(self, factory, client=None, **overrides) -> WorkOrderData:
        client = client or factory.user(SystemRole.CLIENTE)
        brand, model = factory.brand_and_model()
        values = dict(
            cliente=WorkOrderClientData(client.identificacion, client.nombre, client.apellido),
            marca_id=brand.id,
            modelo_id=model.id,
            motivo_ingreso="DIAGNOSTICO",
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
        with uow.transaction():
            tech.identificacion = "1700000001"  # cédula of a non-client user
        with pytest.raises(ValidationError) as exc:
            CreateWorkOrderUseCase(uow).execute(self._data(factory, client=tech), tech)
        assert exc.value.code == "INVALID_CLIENT"

    def test_model_must_belong_to_brand(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        _, other_model = factory.brand_and_model()
        with pytest.raises(ValidationError) as exc:
            CreateWorkOrderUseCase(uow).execute(self._data(factory, modelo_id=other_model.id), tech)
        assert exc.value.code == "MODEL_BRAND_MISMATCH"

    def test_seller_is_the_technician_and_date_is_today(self, uow, factory):
        from datetime import datetime
        from zoneinfo import ZoneInfo

        tz = ZoneInfo("America/Guayaquil")
        seller = factory.user(SystemRole.VENDEDOR)
        order = CreateWorkOrderUseCase(uow, tz).execute(self._data(factory), seller)
        assert order.tecnico_id == seller.id and order.user_id == seller.id
        assert order.fecha == datetime.now(tz).date()

    def test_update_keeps_the_technician(self, uow, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        data = self._data(factory)
        order = CreateWorkOrderUseCase(uow).execute(data, seller)
        admin = factory.user(SystemRole.ADMIN)
        updated = UpdateWorkOrderUseCase(uow).execute(order.id, data, admin)
        assert updated.tecnico_id == seller.id

    def test_update_recomputes_saldo(self, uow, factory):
        tech = factory.user(SystemRole.TECNICO)
        data = self._data(factory)
        order = CreateWorkOrderUseCase(uow).execute(data, tech)
        updated = UpdateWorkOrderUseCase(uow).execute(
            order.id,
            WorkOrderData(**{**data.__dict__, "presupuesto": Decimal("200"), "anticipo": Decimal("50")}),
            tech,
        )
        assert updated.saldo == Decimal("150.00")

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
