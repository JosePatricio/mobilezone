"""WhatsApp Cloud API (Propaganda): phone numbers, message states and opt-out keywords."""
from __future__ import annotations

import re
import unicodedata
from enum import Enum

ECUADOR_CODE = "593"


class WhatsAppMessageStatus(str, Enum):
    PENDIENTE = "PENDIENTE"  # queued, not sent to Meta yet
    ENVIADO = "ENVIADO"  # accepted by Meta (status "sent")
    ENTREGADO = "ENTREGADO"  # reached the phone ("delivered")
    LEIDO = "LEIDO"  # opened by the client ("read")
    FALLIDO = "FALLIDO"  # rejected by Meta or undeliverable ("failed")


# Webhook statuses of Meta -> our states.
META_STATUSES = {
    "sent": WhatsAppMessageStatus.ENVIADO,
    "delivered": WhatsAppMessageStatus.ENTREGADO,
    "read": WhatsAppMessageStatus.LEIDO,
    "failed": WhatsAppMessageStatus.FALLIDO,
}

# Webhooks can arrive out of order ("read" before "delivered"): a state only moves forward.
STATUS_RANK = {
    WhatsAppMessageStatus.PENDIENTE: 0,
    WhatsAppMessageStatus.ENVIADO: 1,
    WhatsAppMessageStatus.FALLIDO: 2,
    WhatsAppMessageStatus.ENTREGADO: 3,
    WhatsAppMessageStatus.LEIDO: 4,
}

# Replies of the client that stop / restart the promotions (compared without accents, upper case).
# "STOP PROMOTIONS" / "DETENER PROMOCIONES" is the text of Meta's built-in opt-out button of marketing templates.
OPT_OUT_KEYWORDS = {"STOP", "BAJA", "PARAR", "CANCELAR", "STOP PROMOTIONS", "DETENER PROMOCIONES"}
OPT_IN_KEYWORDS = {"ALTA", "START", "INICIAR"}


def whatsapp_number(celular: str | None, country_code: str = ECUADOR_CODE) -> str | None:
    """International number without "+" (as the Cloud API expects it), or None when unusable.

    A local number "0991234567" becomes "593991234567". Ecuadorian mobiles must have 9 digits
    after the country code (9XXXXXXXX).
    """
    raw = (celular or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not raw.startswith("+") and digits.startswith("0"):
        digits = country_code + digits[1:]
    if not 10 <= len(digits) <= 15:
        return None
    if digits.startswith(ECUADOR_CODE + "9") and len(digits) != 12:
        return None
    return digits


def normalize_keyword(text: str | None) -> str:
    """Upper case, without accents, punctuation or extra spaces ("¡Baja!" -> "BAJA")."""
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^\w\s]", " ", plain).upper().split())
