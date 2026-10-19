"""Ventas: the descuento of the confirmation form is kept in the sale (receipt) and is not counted in
the "Has vendido" of the header."""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.presentation.api.routes import sales as routes
from app.presentation.api.schemas.sales import CreateSaleRequest, UpdateSaleRequest
from tests.test_api_v4 import _sale

API = "/api/v1"


class _Captured(Exception):
    pass


@pytest.mark.parametrize("action", ["confirm", "update"])
def test_the_routes_pass_the_discount_to_the_use_cases(monkeypatch, action):
    """No database needed: the descuento of the request reaches the use case."""
    seen = []

    class FakeUseCase:
        def __init__(self, uow):
            pass

        def execute(self, *args):
            seen.append(args[-2])  # the data (before the actor)
            raise _Captured

    body = {"items": [{"inventory_id": 1, "cantidad": 1}], "metodo_pago": "EFECTIVO", "descuento": "2.00"}
    with pytest.raises(_Captured):
        if action == "confirm":
            monkeypatch.setattr(routes, "ConfirmSaleUseCase", FakeUseCase)
            routes.confirm_sale(CreateSaleRequest(**body, branch_id=1), uow=None, actor=SimpleNamespace())
        else:
            monkeypatch.setattr(routes, "UpdateSaleUseCase", FakeUseCase)
            routes.update_sale(1, UpdateSaleRequest(**body), uow=None, actor=SimpleNamespace())
    assert seen[0].descuento == Decimal("2.00")


def test_full_discount_sells_zero_and_is_on_the_receipt(client, admin_headers, factory):
    inv = factory.inventory(precio="2.00", stock=5)
    response = _sale(client, admin_headers, inv, descuento="2.00", monto_recibido="0")
    assert response.status_code == 201, response.text
    sale = response.json()
    assert (sale["total"], sale["descuento"], sale["total_pagar"]) == ("2.00", "2.00", "0.00")

    # The receipt (factura / comprobante) gets the discount of the sale.
    assert client.get(f"{API}/sales/{sale['id']}", headers=admin_headers).json()["descuento"] == "2.00"

    # "Has vendido" of the header: a 2 USD sale with a 2 USD discount adds 0.
    summary = client.get(f"{API}/sales/summary/today", headers=admin_headers).json()
    assert (summary["cantidad"], summary["total"], summary["neto"]) == (1, "0.00", "0.00")
