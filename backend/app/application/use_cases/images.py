from __future__ import annotations

from typing import Callable, TypeVar

from app.application.services.files import FileStorage, validate_image
from app.domain.repositories import UnitOfWork

E = TypeVar("E")


def replace_image(
    uow: UnitOfWork,
    storage: FileStorage,
    load: Callable[[], E],
    attribute: str,
    folder: str,
    content: bytes | None,
) -> E:
    """Stores a new image (or removes it when ``content`` is None) keeping DB and files consistent.

    The new file is written before the commit and removed if the transaction
    fails; the previous file is deleted only after a successful commit.
    """
    extension = validate_image(content) if content is not None else None
    new_path = storage.save(folder, content, extension) if content is not None and extension else None
    try:
        with uow.transaction():
            entity = load()
            old_path = getattr(entity, attribute)
            setattr(entity, attribute, new_path)
    except BaseException:
        if new_path:
            storage.delete(new_path)
        raise
    if old_path:
        storage.delete(old_path)
    return entity
