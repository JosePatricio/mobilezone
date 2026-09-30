"""File storage port and image validation rules (product images, user photos)."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.exceptions import ValidationError

MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB

# Detected from the file content (magic bytes), never trusted from the client.
_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
]


def validate_image(content: bytes) -> str:
    """Return the file extension of a valid JPG / PNG / WEBP image or raise ``ValidationError``."""
    if not content:
        raise ValidationError("El archivo está vacío.", code="INVALID_IMAGE")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValidationError("La imagen supera el tamaño máximo de 2 MB.", code="IMAGE_TOO_LARGE")
    for signature, extension in _SIGNATURES:
        if content.startswith(signature):
            return extension
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    raise ValidationError("Formato de imagen no permitido. Use JPG, PNG o WEBP.", code="INVALID_IMAGE")


class FileStorage(ABC):
    @abstractmethod
    def save(self, folder: str, content: bytes, extension: str) -> str:
        """Store the file and return its relative path (e.g. ``products/<uuid>.jpg``)."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Delete a stored file. Missing files are ignored."""
