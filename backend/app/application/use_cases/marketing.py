"""Propaganda (CRM): recipients of the WhatsApp / SMS messages."""
from __future__ import annotations

from app.application.use_cases.base import UseCase
from app.domain.repositories import OrderClient


class OrderClientsQuery(UseCase):
    """Clients that came through Órdenes (not the ones that only bought in Ventas)."""

    def execute(self, *, search: str | None = None, marca_id: int | None = None) -> list[OrderClient]:
        return self.uow.work_orders.order_clients(search=search, marca_id=marca_id)
