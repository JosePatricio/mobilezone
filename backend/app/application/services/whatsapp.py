"""Port of the WhatsApp Business messaging provider (Meta Cloud API in infrastructure)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.domain.exceptions import DomainError

# Header formats of a template that carry a file (sent once per campaign as an uploaded media id).
MEDIA_HEADERS = ("IMAGE", "VIDEO", "DOCUMENT")


class WhatsAppError(DomainError):
    """The provider rejected the request (invalid number, template, token, rate limit...)."""

    code = "WHATSAPP_ERROR"


@dataclass(frozen=True)
class WhatsAppTemplate:
    """Message template approved by Meta: the only kind of message a business can start a chat with."""

    name: str
    language: str  # e.g. "es", "es_EC", "en_US"
    category: str  # MARKETING | UTILITY | AUTHENTICATION
    status: str  # APPROVED, PENDING, REJECTED...
    body: str  # text with placeholders {{1}} or {{nombre}}
    header_format: str | None = None  # TEXT | IMAGE | VIDEO | DOCUMENT | None
    header_text: str | None = None
    footer: str | None = None
    # Placeholders of the body in order: ["1", "2"] (positional) or ["nombre"] (named).
    body_params: list[str] = field(default_factory=list)
    # The header text or a button has its own placeholders: not supported by the campaigns.
    unsupported_params: bool = False


@dataclass(frozen=True)
class OutgoingTemplate:
    """One template message to one phone."""

    to: str  # international number without "+"
    template: str
    language: str
    body_values: list[tuple[str, str]]  # (placeholder, value) in the order of the template
    header_media: tuple[str, str] | None = None  # (IMAGE | VIDEO | DOCUMENT, media id)


class WhatsAppGateway(ABC):
    @abstractmethod
    def templates(self) -> list[WhatsAppTemplate]:
        """Templates of the WhatsApp Business account."""

    @abstractmethod
    def upload_media(self, content: bytes, mime_type: str, filename: str) -> str:
        """Uploads a file for the template header; returns its media id."""

    @abstractmethod
    def send_template(self, message: OutgoingTemplate) -> str:
        """Sends one template message; returns the WhatsApp message id (wamid)."""

    @abstractmethod
    def valid_signature(self, body: bytes, signature: str | None) -> bool:
        """True when a webhook body was signed by Meta with the app secret."""
