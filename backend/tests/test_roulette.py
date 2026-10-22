"""Propaganda → Ruleta: pure tests, no database (the fake Unit of Work of test_whatsapp)."""
from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.application.use_cases.roulette import (
    PublicRouletteUseCases,
    RouletteItemData,
    RouletteState,
    RouletteUseCases,
)
from app.application.use_cases.whatsapp import (
    CreateWhatsAppCampaignUseCase,
    ParamSource,
    RouletteLinkOptions,
    TemplateParam,
)
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.value_objects.whatsapp import whatsapp_number
from tests.test_whatsapp import ADMIN, FakeGateway, FakeStorage, FakeUow, WhatsAppTemplate, _client

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 10
TODAY = date(2026, 10, 22)
NOW = datetime(2026, 10, 22, 15, 0, tzinfo=timezone.utc)
ITEMS = [RouletteItemData("Mica gratis", imagen=PNG), RouletteItemData("10% desc."), RouletteItemData("Sigue intentando", premio=False)]
WITH_LINK = WhatsAppTemplate(
    "promo_ruleta", "es", "MARKETING", "APPROVED", "Hola {{1}}, gira la ruleta: {{2}}", body_params=["1", "2"]
)
NAME_AND_LINK = [TemplateParam(ParamSource.NOMBRE), TemplateParam(ParamSource.RULETA)]


def _create(uow, storage=None, *, fecha_inicio=TODAY, fecha_fin=date(2026, 10, 31), items=ITEMS):
    return RouletteUseCases(uow, storage).create(
        ADMIN, nombre=" Ruleta de octubre ", fecha_inicio=fecha_inicio, fecha_fin=fecha_fin, items=items
    )


def test_create_roulette_stores_options_in_order_with_their_images():
    uow, storage = FakeUow(), FakeStorage()
    roulette = _create(uow, storage)
    assert (roulette.nombre, roulette.items, roulette.enlaces) == ("Ruleta de octubre", 3, 0)
    items = uow.roulettes.items(roulette.id)
    assert [(i.nombre, i.imagen, i.premio) for i in items] == [
        ("Mica gratis", "roulettes/1.png", True),
        ("10% desc.", None, True),
        ("Sigue intentando", None, False),
    ]
    assert storage.files == {"roulettes/1.png": PNG}


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"fecha_fin": date(2026, 10, 21)}, "fecha fin"),
        ({"items": ITEMS[:1]}, "entre 2"),
        ({"items": [RouletteItemData("A"), RouletteItemData(" ")]}, "nombre de cada"),
        ({"items": [RouletteItemData("A", premio=False), RouletteItemData("B", premio=False)]}, "premio"),
        ({"items": [RouletteItemData("A", imagen=b"GIF89a"), RouletteItemData("B")]}, "JPG, PNG o WEBP"),
    ],
)
def test_create_roulette_validates(kwargs, message):
    uow, storage = FakeUow(), FakeStorage()
    with pytest.raises(ValidationError, match=message):
        _create(uow, storage, **kwargs)
    assert uow.roulettes.roulettes == {} and storage.files == {}


def test_images_are_removed_when_the_roulette_is_not_saved():
    uow, storage = FakeUow(), FakeStorage()
    uow.roulettes.create = lambda **_: (_ for _ in ()).throw(RuntimeError("db down"))
    with pytest.raises(RuntimeError):
        _create(uow, storage)
    assert storage.files == {}


def test_delete_only_roulettes_never_sent():
    uow, storage = FakeUow(), FakeStorage()
    first, second = _create(uow, storage), _create(uow, storage)
    uow.roulettes.add_links(second.id, 1, [("tok", 1, "593991234567")])
    RouletteUseCases(uow, storage).delete(first.id)
    assert first.id not in uow.roulettes.roulettes and "roulettes/1.png" not in storage.files
    with pytest.raises(ConflictError):
        RouletteUseCases(uow, storage).delete(second.id)
    with pytest.raises(NotFoundError):
        RouletteUseCases(uow).detail(99)


# --- campaign with "¿Incluir ruleta?" ----------------------------------------------------------------

def test_campaign_sends_a_different_single_use_link_to_each_phone():
    uow = FakeUow([_client(1, "0991234567", nombre="Ana"), _client(2, "0987654321", nombre="Luis")])
    roulette = _create(uow)
    created = CreateWhatsAppCampaignUseCase(uow, FakeGateway([WITH_LINK]), "593").execute(
        ADMIN, plantilla="promo_ruleta", idioma="es", cliente_ids=[1, 2], parametros=NAME_AND_LINK,
        numeros=["0981111111"],
        ruleta=RouletteLinkOptions(roulette.id, "https://pixcell.net/", TODAY),
    )
    assert created.encolados == 3
    links = uow.roulettes.links(roulette.id)
    assert [(link["cliente_id"], link["telefono"], link["campaign_id"]) for link in links] == [
        (1, "593991234567", 1), (2, "593987654321", 1), (None, "593981111111", 1),
    ]
    assert len({link["token"] for link in links}) == 3
    by_phone = {link["telefono"]: link["token"] for link in links}
    for message in uow.whatsapp.messages.values():
        assert message["parametros"][1] == ("2", f"https://pixcell.net/ruleta/{by_phone[message['telefono']]}")
    assert uow.whatsapp.messages[1]["parametros"][0] == ("1", "Ana")


def test_campaign_with_roulette_is_validated():
    uow = FakeUow([_client(1, "0991234567")])
    roulette = _create(uow, fecha_fin=date(2026, 10, 25))
    use_case = CreateWhatsAppCampaignUseCase(uow, FakeGateway([WITH_LINK]), "593")
    run = lambda params, ruleta: use_case.execute(  # noqa: E731
        ADMIN, plantilla="promo_ruleta", idioma="es", cliente_ids=[1], parametros=params, ruleta=ruleta
    )
    name_and_text = [TemplateParam(ParamSource.NOMBRE), TemplateParam(ParamSource.TEXTO, "x")]
    with pytest.raises(ValidationError, match="Elija la ruleta"):
        run(NAME_AND_LINK, None)
    with pytest.raises(ValidationError, match="variable"):
        run(name_and_text, RouletteLinkOptions(roulette.id, "https://x.com", TODAY))
    with pytest.raises(NotFoundError):
        run(NAME_AND_LINK, RouletteLinkOptions(99, "https://x.com", TODAY))
    with pytest.raises(ValidationError, match="vigente"):
        run(NAME_AND_LINK, RouletteLinkOptions(roulette.id, "https://x.com", date(2026, 10, 26)))
    assert uow.whatsapp.campaigns == [] and uow.roulettes.links_ == {}


# --- public page of the client -------------------------------------------------------------------------

def _sent(uow, roulette_id, token="tok"):
    uow.roulettes.add_links(roulette_id, 1, [(token, 1, whatsapp_number("0991234567"))])
    return token


def test_opening_the_link_records_only_the_first_visit():
    uow = FakeUow()
    token = _sent(uow, _create(uow).id)
    public = PublicRouletteUseCases(uow, TODAY, NOW).view(token)
    assert (public.nombre, public.estado, public.resultado, len(public.items)) == (
        "Ruleta de octubre", RouletteState.DISPONIBLE, None, 3
    )
    PublicRouletteUseCases(uow, TODAY, datetime(2026, 10, 23, tzinfo=timezone.utc)).view(token)
    assert uow.roulettes.links_[1]["abierto_at"] == NOW


def test_playing_records_the_prize_and_disables_the_link():
    uow = FakeUow()
    roulette = _create(uow)
    token = _sent(uow, roulette.id)
    played = PublicRouletteUseCases(uow, TODAY, NOW).play(token)
    link = uow.roulettes.links_[1]
    item = played.items[played.resultado]
    assert played.estado == RouletteState.JUGADO
    assert (link["jugado_at"], link["abierto_at"], link["resultado"], link["gano"]) == (NOW, NOW, item.nombre, item.premio)
    assert played.gano == item.premio
    with pytest.raises(ConflictError, match="Ya jugó"):
        PublicRouletteUseCases(uow, TODAY, NOW).play(token)
    again = PublicRouletteUseCases(uow, TODAY, NOW).view(token)
    assert (again.estado, again.resultado) == (RouletteState.JUGADO, played.resultado)
    summary = RouletteUseCases(uow).detail(roulette.id).roulette
    assert (summary.enlaces, summary.abiertos, summary.jugados, summary.ganadores) == (1, 1, 1, int(item.premio))


def test_every_option_can_come_out():
    uow = FakeUow()
    roulette = _create(uow)
    results = set()
    for n in range(200):
        results.add(PublicRouletteUseCases(uow, TODAY, NOW).play(_sent(uow, roulette.id, f"t{n}")).resultado)
    assert results == {0, 1, 2}


@pytest.mark.parametrize(
    "today, state, message",
    [(date(2026, 10, 21), RouletteState.NO_INICIADA, "aún no"), (date(2026, 11, 1), RouletteState.VENCIDA, "vigente")],
)
def test_roulette_can_only_be_played_between_its_dates(today, state, message):
    uow = FakeUow()
    token = _sent(uow, _create(uow).id)
    assert PublicRouletteUseCases(uow, today, NOW).view(token).estado == state
    with pytest.raises(ConflictError, match=message):
        PublicRouletteUseCases(uow, today, NOW).play(token)
    assert uow.roulettes.links_[1]["jugado_at"] is None


def test_unknown_link():
    with pytest.raises(NotFoundError):
        PublicRouletteUseCases(FakeUow(), TODAY).view("nope")
