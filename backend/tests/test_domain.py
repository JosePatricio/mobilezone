"""Pure domain tests: entities and business rules, no database."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.entities import (
    Inventory,
    Permission,
    Product,
    Role,
    Sale,
    User,
    WorkOrder,
    WorkOrderSparePart,
    calculate_balance,
)
from app.domain.exceptions import ConflictError, InsufficientStockError, ValidationError
from app.domain.value_objects.enums import SaleStatus, WorkOrderStatus
from app.domain.value_objects.identificacion import normalize_identificacion
from app.domain.value_objects.locations import PROVINCES, validate_location
from app.domain.value_objects.money import to_money


def make_product(precio: str = "10.00") -> Product:
    return Product(
        category_id=1,
        sku="pan-01",
        nombre="Pantalla",
        precio_venta=Decimal(precio),
        precio_costo=Decimal("5"),
        precio_mayor=Decimal("8"),
        id=1,
    )


def make_inventory(stock: int = 10) -> Inventory:
    return Inventory(product_id=1, branch_id=1, stock=stock, id=1)


class TestInventory:
    def test_decrease_stock(self):
        inventory = make_inventory(stock=10)
        inventory.decrease_stock(3)
        assert inventory.stock == 7

    def test_decrease_stock_insufficient_raises_and_keeps_stock(self):
        inventory = make_inventory(stock=2)
        with pytest.raises(InsufficientStockError) as exc:
            inventory.decrease_stock(3)
        assert exc.value.code == "INSUFFICIENT_STOCK"
        assert inventory.stock == 2

    def test_stock_can_reach_zero(self):
        inventory = make_inventory(stock=3)
        inventory.decrease_stock(3)
        assert inventory.stock == 0

    @pytest.mark.parametrize("cantidad", [0, -1])
    def test_invalid_quantity(self, cantidad):
        with pytest.raises(ValidationError):
            make_inventory().decrease_stock(cantidad)

    def test_negative_initial_stock_rejected(self):
        with pytest.raises(ValidationError):
            make_inventory(stock=-1)

    def test_adjust_stock(self):
        inventory = make_inventory(stock=5)
        inventory.adjust_stock(5)
        inventory.adjust_stock(-8)
        assert inventory.stock == 2
        with pytest.raises(InsufficientStockError):
            inventory.adjust_stock(-3)


class TestProduct:
    def test_negative_price_rejected(self):
        with pytest.raises(ValidationError):
            make_product(precio="-1")

    def test_price_is_normalized_to_two_decimals(self):
        assert make_product(precio="10.005").precio_venta == Decimal("10.01")

    def test_sku_is_normalized_and_validated(self):
        assert make_product().sku == "PAN-01"
        with pytest.raises(ValidationError):
            Product(category_id=1, sku="con espacio", nombre="X", precio_venta=Decimal("1"))


class TestIdentificacion:
    @pytest.mark.parametrize("value", ["1712345675", "0102030400", "0911111110", "3050000003"])
    def test_valid_cedulas(self, value):
        assert normalize_identificacion(value) == value

    @pytest.mark.parametrize(
        "value",
        [
            "1712345678",  # wrong check digit
            "2512345678",  # province 25 does not exist
            "1762345675",  # third digit > 5
            "12345",  # length
            "17123456750",  # 11 digits
        ],
    )
    def test_invalid_cedulas(self, value):
        with pytest.raises(ValidationError) as exc:
            normalize_identificacion(value)
        assert exc.value.code == "INVALID_IDENTIFICATION"

    def test_ruc(self):
        assert normalize_identificacion("1712345675001") == "1712345675001"  # natural person
        assert normalize_identificacion("1790012345001") == "1790012345001"  # private company
        assert normalize_identificacion("1760001550001") == "1760001550001"  # public entity
        for invalid in ("1712345675000", "1712345678001", "1780012345001"):
            with pytest.raises(ValidationError):
                normalize_identificacion(invalid)

    def test_spaces_and_dashes_are_ignored(self):
        assert normalize_identificacion(" 171234567-5 ") == "1712345675"


class TestLocations:
    def test_province_and_city(self):
        assert validate_location("Pichincha", "Quito") == ("Pichincha", "Quito")
        assert validate_location(None, None) == (None, None)
        assert len(PROVINCES) == 24
        assert sum(len(c) for c in PROVINCES.values()) == 221

    @pytest.mark.parametrize("provincia,ciudad", [("Pichincha", "Guayaquil"), ("Narnia", "Quito"), (None, "Quito")])
    def test_city_must_belong_to_province(self, provincia, ciudad):
        with pytest.raises(ValidationError):
            validate_location(provincia, ciudad)


class TestSale:
    def test_total_and_historical_price(self):
        sale = Sale(user_id=1)
        sale.add_line(product_id=1, cantidad=2, precio_unitario=Decimal("10.00"))
        sale.add_line(product_id=2, cantidad=1, precio_unitario=Decimal("25.00"))
        assert [d.subtotal for d in sale.details] == [Decimal("20.00"), Decimal("25.00")]
        assert sale.total == Decimal("45.00")

    def test_cancel_twice_rejected(self):
        sale = Sale(user_id=1)
        sale.cancel()
        assert sale.estado == SaleStatus.ANULADA
        with pytest.raises(ConflictError):
            sale.cancel()


class TestWorkOrderBalance:
    def test_balance(self):
        assert calculate_balance(Decimal("100"), Decimal("30"))[2] == Decimal("70.00")

    def test_negative_values_rejected(self):
        with pytest.raises(ValidationError):
            calculate_balance(Decimal("-1"), Decimal("0"))
        with pytest.raises(ValidationError):
            calculate_balance(Decimal("10"), Decimal("-1"))

    def test_advance_greater_than_budget_rejected(self):
        with pytest.raises(ValidationError) as exc:
            calculate_balance(Decimal("10"), Decimal("11"))
        assert exc.value.code == "ADVANCE_EXCEEDS_BUDGET"

    def test_work_order_computes_saldo(self):
        order = WorkOrder(
            user_id=1, cliente_id=2, marca_id=1, modelo_id=1, presupuesto=Decimal("100"), anticipo=Decimal("30")
        )
        assert order.saldo == Decimal("70.00")
        order.set_amounts(Decimal("150"), Decimal("50"))
        assert order.saldo == Decimal("100.00")

    def test_status_is_centralized(self):
        order = WorkOrder(user_id=1, cliente_id=2, marca_id=1, modelo_id=1)
        order.change_status(2)
        assert order.status == WorkOrderStatus.ESTADO_2
        with pytest.raises(ValidationError):
            order.change_status(3)

    def test_spare_parts_total(self):
        order = WorkOrder(user_id=1, cliente_id=2, marca_id=1, modelo_id=1)
        order.add_spare_part(WorkOrderSparePart(spare_part_id=1, technician_id=3, cantidad=2, precio=Decimal("10")))
        assert order.spare_parts_total == Decimal("20.00")


class TestUser:
    def test_permissions_come_from_active_role(self):
        role = Role(nombre="tecnico", permissions=[Permission(codigo="a.view"), Permission(codigo="a.create")])
        user = User(nombre="Ana", apellido="Paz", email="ANA@X.COM", rol_id=1)
        user.role = role  # type: ignore[attr-defined]
        assert user.email == "ana@x.com"
        assert role.nombre == "TECNICO"
        assert user.has_permission("a.view")
        role.deactivate()
        assert not user.has_permission("a.view")

    def test_inactive_user_has_no_permissions(self):
        user = User(nombre="A", apellido="B", email="a@b.c", rol_id=1, estado=False)
        user.role = Role(nombre="ADMIN", permissions=[Permission(codigo="x")])  # type: ignore[attr-defined]
        assert user.permissions == set()

    def test_blank_name_rejected(self):
        with pytest.raises(ValidationError):
            User(nombre="  ", apellido="B", email="a@b.c", rol_id=1)


def test_to_money_rejects_garbage():
    with pytest.raises(ValidationError):
        to_money("abc")
    with pytest.raises(ValidationError):
        to_money(float("nan"))
