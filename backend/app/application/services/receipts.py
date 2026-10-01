"""Port for rendering sale receipts (comprobantes). Implemented in infrastructure/pdf."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.entities import Sale


class ReceiptRenderer(ABC):
    @abstractmethod
    def render(self, sale: Sale) -> bytes:
        """Returns the receipt as a PDF document."""
