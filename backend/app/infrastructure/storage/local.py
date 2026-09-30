from __future__ import annotations

import uuid
from pathlib import Path

from app.application.services.files import FileStorage


class LocalFileStorage(FileStorage):
    """Stores uploaded files on disk under ``base_dir`` (served at ``/media`` by the API)."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir).resolve()

    def save(self, folder: str, content: bytes, extension: str) -> str:
        relative = f"{folder}/{uuid.uuid4().hex}.{extension}"
        target = self._resolve(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return relative

    def delete(self, path: str) -> None:
        try:
            self._resolve(path).unlink(missing_ok=True)
        except (OSError, ValueError):
            pass  # a stale file must never break the operation

    def _resolve(self, relative: str) -> Path:
        target = (self.base_dir / relative).resolve()
        if self.base_dir not in target.parents:
            raise ValueError("Invalid storage path")
        return target
