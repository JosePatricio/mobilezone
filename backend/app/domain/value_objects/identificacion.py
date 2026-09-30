"""Ecuadorian identification numbers: cédula (10 digits) and RUC (13 digits).

* Cédula: province code 01-24 (or 30 for Ecuadorians registered abroad), third
  digit 0-5 and the "módulo 10" check digit.
* RUC of a natural person (third digit 0-5): a valid cédula + establishment code
  (last 3 digits, not 000).
* RUC of a public entity (6) or a private company (9): province, third digit and
  establishment code are validated. The check digit is intentionally not
  enforced: the SRI has issued valid RUCs that do not satisfy the historical
  "módulo 11" rule, and rejecting a real taxpayer is worse than accepting a typo.
"""
from __future__ import annotations

import re

from app.domain.exceptions import ValidationError


def _valid_province(code: str) -> bool:
    province = int(code[:2])
    return 1 <= province <= 24 or province == 30


def cedula_check_digit(first_nine: str) -> int:
    total = 0
    for index, char in enumerate(first_nine):
        value = int(char) * (2 if index % 2 == 0 else 1)
        total += value - 9 if value > 9 else value
    return (10 - total % 10) % 10


def is_valid_cedula(value: str) -> bool:
    if not re.fullmatch(r"\d{10}", value):
        return False
    if not _valid_province(value) or int(value[2]) > 5:
        return False
    return cedula_check_digit(value[:9]) == int(value[9])


def is_valid_ruc(value: str) -> bool:
    if not re.fullmatch(r"\d{13}", value) or not _valid_province(value):
        return False
    third = int(value[2])
    if third <= 5:  # natural person
        return is_valid_cedula(value[:10]) and value[10:] != "000"
    if third == 6:  # public entity
        return value[9:] != "0000"
    if third == 9:  # private company
        return value[10:] != "000"
    return False


def normalize_identificacion(value: str | None) -> str | None:
    """Validates a cédula / RUC and returns it without spaces or dashes (None if empty)."""
    text = re.sub(r"[\s-]", "", value or "")
    if not text:
        return None
    if len(text) == 10 and is_valid_cedula(text):
        return text
    if len(text) == 13 and is_valid_ruc(text):
        return text
    raise ValidationError(
        "La cédula o el RUC no es válido.", code="INVALID_IDENTIFICATION", details={"field": "identificacion"}
    )
