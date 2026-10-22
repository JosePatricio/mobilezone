"""Propaganda → Ruleta: prize wheels and the single-use links sent to the clients in the campaigns."""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum

from app.application.services.files import FileStorage, validate_image
from app.application.use_cases.base import UseCase
from app.domain.entities import User
from app.domain.entities.base import utcnow
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import RouletteItemRow, RouletteLink, RoulettePlayRow, RouletteSummary, UnitOfWork

ROULETTE_IMAGES_FOLDER = "roulettes"
MIN_ITEMS = 2
MAX_ITEMS = 24


def new_token() -> str:
    """Unguessable code of a public link (URL safe)."""
    return secrets.token_urlsafe(18)


@dataclass(frozen=True)
class RouletteItemData:
    nombre: str
    premio: bool = True
    imagen: bytes | None = None


@dataclass(frozen=True)
class RouletteDetail:
    roulette: RouletteSummary
    items: list[RouletteItemRow]
    links: list[RoulettePlayRow]


class RouletteState(str, Enum):
    """What the client sees when opening the link."""

    DISPONIBLE = "DISPONIBLE"  # can spin the wheel
    JUGADO = "JUGADO"  # already played: the link no longer works
    NO_INICIADA = "NO_INICIADA"  # before fecha_inicio
    VENCIDA = "VENCIDA"  # after fecha_fin


@dataclass(frozen=True)
class PublicRoulette:
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    items: list[RouletteItemRow]
    estado: RouletteState
    resultado: int | None  # index in ``items`` of the slice it stopped on (once played)
    gano: bool


def roulette_active(roulette: RouletteSummary, today: date) -> bool:
    """The wheel can still be played (the links of a campaign are useful)."""
    return roulette.fecha_fin >= today


class RouletteUseCases(UseCase):
    def __init__(self, uow: UnitOfWork, storage: FileStorage | None = None) -> None:
        super().__init__(uow)
        self.storage = storage

    def create(
        self, actor: User, *, nombre: str, fecha_inicio: date, fecha_fin: date, items: list[RouletteItemData]
    ) -> RouletteSummary:
        nombre = nombre.strip()
        if not nombre:
            raise ValidationError("Escriba el nombre de la ruleta.", code="ROULETTE_NAME")
        if fecha_fin < fecha_inicio:
            raise ValidationError("La fecha fin no puede ser anterior a la fecha de inicio.", code="ROULETTE_DATES")
        if not MIN_ITEMS <= len(items) <= MAX_ITEMS:
            raise ValidationError(
                f"La ruleta debe tener entre {MIN_ITEMS} y {MAX_ITEMS} opciones.", code="ROULETTE_ITEMS"
            )
        if any(not item.nombre.strip() for item in items):
            raise ValidationError("Escriba el nombre de cada opción.", code="ROULETTE_ITEMS")
        if not any(item.premio for item in items):
            raise ValidationError("Al menos una opción debe ser un premio.", code="ROULETTE_ITEMS")
        # Validate every image before storing any of them.
        extensions = [validate_image(item.imagen) if item.imagen is not None else None for item in items]
        saved: list[str] = []
        try:
            paths = []
            for item, extension in zip(items, extensions):
                path = None
                if item.imagen is not None and self.storage is not None:
                    path = self.storage.save(ROULETTE_IMAGES_FOLDER, item.imagen, extension)
                    saved.append(path)
                paths.append(path)
            with self.uow.transaction():
                roulette_id = self.uow.roulettes.create(
                    nombre=nombre,
                    fecha_inicio=fecha_inicio,
                    fecha_fin=fecha_fin,
                    created_by=actor.id,
                    items=[(item.nombre.strip(), path, item.premio) for item, path in zip(items, paths)],
                )
        except BaseException:
            for path in saved:
                self.storage.delete(path)
            raise
        return self.uow.roulettes.get(roulette_id)

    def list(self) -> list[RouletteSummary]:
        return self.uow.roulettes.summaries()

    def _get(self, roulette_id: int) -> RouletteSummary:
        roulette = self.uow.roulettes.get(roulette_id)
        if roulette is None:
            raise NotFoundError("Ruleta no encontrada.", code="ROULETTE_NOT_FOUND")
        return roulette

    def detail(self, roulette_id: int) -> RouletteDetail:
        roulette = self._get(roulette_id)
        return RouletteDetail(roulette, self.uow.roulettes.items(roulette_id), self.uow.roulettes.links(roulette_id))

    def delete(self, roulette_id: int) -> None:
        """Only wheels whose links were never sent: the clients must not get a broken link."""
        roulette = self._get(roulette_id)
        if roulette.enlaces:
            raise ConflictError(
                "La ruleta ya se envió en una campaña: no se puede eliminar.", code="ROULETTE_IN_USE"
            )
        images = [item.imagen for item in self.uow.roulettes.items(roulette_id) if item.imagen]
        with self.uow.transaction():
            self.uow.roulettes.delete(roulette_id)
        if self.storage is not None:
            for path in images:
                self.storage.delete(path)


class PublicRouletteUseCases(UseCase):
    """The page of the client (no session): opened and played through the link of the message."""

    def __init__(self, uow: UnitOfWork, today: date, now: datetime | None = None) -> None:
        super().__init__(uow)
        self.today = today
        self.now = now

    def _link(self, token: str, *, for_update: bool = False) -> RouletteLink:
        link = self.uow.roulettes.link_by_token(token.strip(), for_update=for_update) if token else None
        if link is None:
            raise NotFoundError("El enlace de la ruleta no existe.", code="ROULETTE_LINK_NOT_FOUND")
        return link

    def _state(self, roulette: RouletteSummary, link: RouletteLink) -> RouletteState:
        if link.jugado_at is not None:
            return RouletteState.JUGADO
        if self.today < roulette.fecha_inicio:
            return RouletteState.NO_INICIADA
        if self.today > roulette.fecha_fin:
            return RouletteState.VENCIDA
        return RouletteState.DISPONIBLE

    def _public(self, link: RouletteLink, items: list[RouletteItemRow] | None = None) -> PublicRoulette:
        roulette = self.uow.roulettes.get(link.roulette_id)
        items = items if items is not None else self.uow.roulettes.items(link.roulette_id)
        index = next((i for i, item in enumerate(items) if item.id == link.item_id), None)
        return PublicRoulette(
            nombre=roulette.nombre,
            fecha_inicio=roulette.fecha_inicio,
            fecha_fin=roulette.fecha_fin,
            items=items,
            estado=self._state(roulette, link),
            resultado=index,
            gano=link.gano,
        )

    def view(self, token: str) -> PublicRoulette:
        """Shows the wheel; the first visit is recorded (date and time the client opened the link)."""
        with self.uow.transaction():
            link = self._link(token)
            if link.abierto_at is None:
                self.uow.roulettes.mark_opened(link.id, self.now or utcnow())
        return self._public(link)

    def play(self, token: str) -> PublicRoulette:
        """Spins the wheel once: the slice is chosen here (never by the browser) and the link is disabled."""
        with self.uow.transaction():
            link = self._link(token, for_update=True)  # two clicks at once: the second one waits and fails
            roulette = self.uow.roulettes.get(link.roulette_id)
            state = self._state(roulette, link)
            if state == RouletteState.JUGADO:
                raise ConflictError("Ya jugó con este enlace.", code="ROULETTE_ALREADY_PLAYED")
            if state == RouletteState.NO_INICIADA:
                raise ConflictError("La ruleta aún no está disponible.", code="ROULETTE_NOT_STARTED")
            if state == RouletteState.VENCIDA:
                raise ConflictError("La ruleta ya no está vigente.", code="ROULETTE_EXPIRED")
            items = self.uow.roulettes.items(link.roulette_id)
            item = items[secrets.randbelow(len(items))]
            now = self.now or utcnow()
            if link.abierto_at is None:
                self.uow.roulettes.mark_opened(link.id, now)
            self.uow.roulettes.mark_played(link.id, now, item)
        played = RouletteLink(link.id, link.roulette_id, link.abierto_at or now, now, item.id, item.nombre, item.premio)
        return self._public(played, items)
