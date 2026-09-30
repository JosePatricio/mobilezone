"""Provinces of Ecuador and their cantons ("ciudades"). Single source for the API and validation."""
from __future__ import annotations

from app.domain.exceptions import ValidationError

PROVINCES: dict[str, list[str]] = {
    "Azuay": [
        "Cuenca", "Camilo Ponce Enríquez", "Chordeleg", "El Pan", "Girón", "Guachapala", "Gualaceo", "Nabón",
        "Oña", "Paute", "Pucará", "San Fernando", "Santa Isabel", "Sevilla de Oro", "Sígsig",
    ],
    "Bolívar": ["Guaranda", "Caluma", "Chillanes", "Chimbo", "Echeandía", "Las Naves", "San Miguel"],
    "Cañar": ["Azogues", "Biblián", "Cañar", "Déleg", "El Tambo", "La Troncal", "Suscal"],
    "Carchi": ["Tulcán", "Bolívar", "Espejo", "Mira", "Montúfar", "San Pedro de Huaca"],
    "Chimborazo": [
        "Riobamba", "Alausí", "Chambo", "Chunchi", "Colta", "Cumandá", "Guamote", "Guano", "Pallatanga", "Penipe",
    ],
    "Cotopaxi": ["Latacunga", "La Maná", "Pangua", "Pujilí", "Salcedo", "Saquisilí", "Sigchos"],
    "El Oro": [
        "Machala", "Arenillas", "Atahualpa", "Balsas", "Chilla", "El Guabo", "Huaquillas", "Las Lajas",
        "Marcabelí", "Pasaje", "Piñas", "Portovelo", "Santa Rosa", "Zaruma",
    ],
    "Esmeraldas": ["Esmeraldas", "Atacames", "Eloy Alfaro", "Muisne", "Quinindé", "Rioverde", "San Lorenzo"],
    "Galápagos": ["San Cristóbal", "Isabela", "Santa Cruz"],
    "Guayas": [
        "Guayaquil", "Alfredo Baquerizo Moreno", "Balao", "Balzar", "Colimes", "Coronel Marcelino Maridueña",
        "Daule", "Durán", "El Empalme", "El Triunfo", "General Antonio Elizalde", "Isidro Ayora",
        "Lomas de Sargentillo", "Milagro", "Naranjal", "Naranjito", "Nobol", "Palestina", "Pedro Carbo", "Playas",
        "Salitre", "Samborondón", "Santa Lucía", "Simón Bolívar", "Yaguachi",
    ],
    "Imbabura": ["Ibarra", "Antonio Ante", "Cotacachi", "Otavalo", "Pimampiro", "San Miguel de Urcuquí"],
    "Loja": [
        "Loja", "Calvas", "Catamayo", "Celica", "Chaguarpamba", "Espíndola", "Gonzanamá", "Macará", "Olmedo",
        "Paltas", "Pindal", "Puyango", "Quilanga", "Saraguro", "Sozoranga", "Zapotillo",
    ],
    "Los Ríos": [
        "Babahoyo", "Baba", "Buena Fe", "Mocache", "Montalvo", "Palenque", "Puebloviejo", "Quevedo", "Quinsaloma",
        "Urdaneta", "Valencia", "Ventanas", "Vinces",
    ],
    "Manabí": [
        "Portoviejo", "24 de Mayo", "Bolívar", "Chone", "El Carmen", "Flavio Alfaro", "Jama", "Jaramijó", "Jipijapa",
        "Junín", "Manta", "Montecristi", "Olmedo", "Paján", "Pedernales", "Pichincha", "Puerto López", "Rocafuerte",
        "San Vicente", "Santa Ana", "Sucre", "Tosagua",
    ],
    "Morona Santiago": [
        "Macas", "Gualaquiza", "Huamboya", "Limón Indanza", "Logroño", "Pablo Sexto", "Palora", "San Juan Bosco",
        "Santiago", "Sucúa", "Taisha", "Tiwintza",
    ],
    "Napo": ["Tena", "Archidona", "Carlos Julio Arosemena Tola", "El Chaco", "Quijos"],
    "Orellana": ["Francisco de Orellana (Coca)", "Aguarico", "La Joya de los Sachas", "Loreto"],
    "Pastaza": ["Puyo", "Arajuno", "Mera", "Santa Clara"],
    "Pichincha": [
        "Quito", "Cayambe", "Mejía", "Pedro Moncayo", "Pedro Vicente Maldonado", "Puerto Quito", "Rumiñahui",
        "San Miguel de los Bancos",
    ],
    "Santa Elena": ["Santa Elena", "La Libertad", "Salinas"],
    "Santo Domingo de los Tsáchilas": ["Santo Domingo", "La Concordia"],
    "Sucumbíos": [
        "Nueva Loja (Lago Agrio)", "Cascales", "Cuyabeno", "Gonzalo Pizarro", "Putumayo", "Shushufindi", "Sucumbíos",
    ],
    "Tungurahua": [
        "Ambato", "Baños de Agua Santa", "Cevallos", "Mocha", "Patate", "Quero", "San Pedro de Pelileo",
        "Santiago de Píllaro", "Tisaleo",
    ],
    "Zamora Chinchipe": [
        "Zamora", "Centinela del Cóndor", "Chinchipe", "El Pangui", "Nangaritza", "Palanda", "Paquisha", "Yacuambi",
        "Yantzaza",
    ],
}


def validate_location(provincia: str | None, ciudad: str | None) -> tuple[str | None, str | None]:
    """Both empty, or a known province and one of its cities."""
    provincia = (provincia or "").strip() or None
    ciudad = (ciudad or "").strip() or None
    if provincia is None and ciudad is None:
        return None, None
    if provincia not in PROVINCES:
        raise ValidationError("Seleccione una provincia válida.", code="INVALID_PROVINCE", details={"field": "provincia"})
    if ciudad not in PROVINCES[provincia]:
        raise ValidationError(
            f"Seleccione una ciudad de {provincia}.", code="INVALID_CITY", details={"field": "ciudad"}
        )
    return provincia, ciudad
