"""Localisation backend des messages destinés à l'utilisateur.

Les codes API et valeurs télémétriques restent stables ; seule la chaîne d'affichage
est localisée au dernier moment, selon Accept-Language.
"""
from __future__ import annotations
from typing import Any
import json
from pathlib import Path

_LOCALES = Path(__file__).with_name("locales")
CATALOGUES: dict[str, dict[str, str]] = {
    language: json.loads((_LOCALES / f"{language}.json").read_text(encoding="utf8"))
    for language in ("fr", "en")
}

def locale_from_accept_language(header: str | None) -> str:
    if not header:
        return "en"
    for item in header.split(","):
        language = item.split(";", 1)[0].strip().lower().split("-", 1)[0]
        if language in CATALOGUES:
            return language
    return "en"

def localized_message(message: Any, language: str) -> Any:
    if not isinstance(message, str):
        return message
    locale = language if language in CATALOGUES else "en"
    return CATALOGUES[locale].get(message, message)
