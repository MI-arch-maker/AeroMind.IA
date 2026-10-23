#!/usr/bin/env python3
"""Validate locale tree symmetry, duplicate keys, and initial bundle budget."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1] / "frontend" / "client" / "src" / "i18n" / "locales"
LOCALES = ("fr", "en")
MAX_BYTES = 150 * 1024


def reject_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate key: {key}")
        result[key] = value
    return result


def load(locale):
    path = ROOT / f"{locale}.json"
    raw = path.read_text(encoding="utf-8")
    if len(raw.encode("utf-8")) > MAX_BYTES:
        raise ValueError(f"{path}: exceeds {MAX_BYTES} bytes ({len(raw.encode('utf-8'))})")
    parsed = json.loads(raw, object_pairs_hook=reject_duplicates)
    if not isinstance(parsed, dict):
        raise ValueError(f"{path}: root must be an object")
    return parsed


def key_tree(value, prefix=""):
    keys = set()
    for key, child in value.items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(child, dict):
            keys |= key_tree(child, full)
        elif isinstance(child, str):
            keys.add(full)
        else:
            raise ValueError(f"{full}: translation leaf must be a string")
    return keys


def main():
    catalogs = {locale: load(locale) for locale in LOCALES}
    trees = {locale: key_tree(catalog) for locale, catalog in catalogs.items()}
    missing_fr = sorted(trees["en"] - trees["fr"])
    missing_en = sorted(trees["fr"] - trees["en"])
    if missing_fr or missing_en:
        print(f"FR missing: {missing_fr}\nEN missing: {missing_en}", file=sys.stderr)
        return 1
    print(f"Locale catalogs synchronized: {len(trees['fr'])} leaf keys; initial payloads within {MAX_BYTES} bytes each.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"i18n catalog check failed: {error}", file=sys.stderr)
        raise SystemExit(1)
