"""Bounded, non-executing validators for AeroMind engineering file profiles.

STEP support here is deliberately limited to Part 21 structure inspection. It
is not a B-rep/geometry parser and must never be represented as geometry import.
"""
from __future__ import annotations

import csv
import json
import math
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

MAX_CSV_ROWS = 500_000
MAX_CSV_COLUMNS = 256
MAX_FIELD_CHARS = 65_536
MAX_STEP_LINE_BYTES = 1_000_000
MAX_STEP_HEADER_BYTES = 1_000_000
MAX_STEP_ENTITIES = 500_000

BOM_COLUMNS = (
    "part_id", "revision", "name", "quantity", "quantity_unit",
    "material_id", "unit_mass_kg", "source_ref",
)
BOM_REQUIRED = {"part_id", "revision", "name", "quantity"}
RESULT_COLUMNS = (
    "run_id", "timestamp_utc", "signal", "value", "unit", "frame",
    "quality_flag", "source",
)
RESULT_REQUIRED = set(RESULT_COLUMNS)
QUANTITY_UNITS = {"ea", "each", "piece", "unit", "pcs"}
RESULT_UNITS = {
    "1", "%", "m", "mm", "km", "m/s", "km/h", "s", "ms", "kg",
    "g", "N", "Pa", "kPa", "bar", "W", "kW", "Wh", "kWh", "V",
    "A", "mAh", "deg", "rad", "degC", "K", "count",
}
RESULT_SIGNALS = {
    "position_x", "position_y", "position_z", "velocity_x", "velocity_y",
    "velocity_z", "altitude", "airspeed", "groundspeed", "battery_voltage",
    "battery_current", "battery_remaining", "thrust", "temperature", "rpm",
    "fuel_remaining", "fuel_flow",
}
RESULT_FRAMES = {"body", "NED", "ENU", "local", "world", "map", "none"}
QUALITY_FLAGS = {"good", "suspect", "bad", "unknown"}
CSV_PROFILES = {
    "aeromind.bom.v1": {"columns": BOM_COLUMNS, "required": BOM_REQUIRED},
    "aeromind.simulation-results.v1": {"columns": RESULT_COLUMNS, "required": RESULT_REQUIRED},
}
DIALECTS = {
    "utf8-comma-v1": {"delimiter": ",", "encoding": "utf-8", "requires_bom": False},
    "utf8-bom-comma-v1": {"delimiter": ",", "encoding": "utf-8-sig", "requires_bom": True},
    "utf8-semicolon-v1": {"delimiter": ";", "encoding": "utf-8", "requires_bom": False},
}

# csv.field_size_limit is process-global. Set a conservative, explicit bound.
csv.field_size_limit(MAX_FIELD_CHARS)


class FileValidationError(ValueError):
    def __init__(self, code: str, message: str, *, report: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.report = report or {}


def _text(value: str, field: str, limit: int = 4096) -> str:
    result = value.strip()
    if len(result) > limit:
        raise ValueError(f"{field}: longueur supérieure à {limit} caractères")
    if "\x00" in result:
        raise ValueError(f"{field}: caractère NUL interdit")
    return result


def _finite_decimal(value: str, field: str, *, minimum: Decimal | None = None) -> str:
    try:
        number = Decimal(value.strip())
    except (InvalidOperation, AttributeError):
        raise ValueError(f"{field}: nombre décimal invalide") from None
    if not number.is_finite() or (minimum is not None and number < minimum):
        raise ValueError(f"{field}: valeur hors limites ou non finie")
    # Canonical decimal text avoids binary float rounding in imported source data.
    return format(number.normalize(), "f") if number else "0"


def _normalize_bom(row: dict[str, str]) -> dict[str, str | None]:
    part_id = _text(row.get("part_id", ""), "part_id", 160)
    revision = _text(row.get("revision", ""), "revision", 80)
    name = _text(row.get("name", ""), "name", 240)
    if not part_id or not revision or not name:
        raise ValueError("part_id, revision et name ne peuvent pas être vides")
    quantity = _finite_decimal(row.get("quantity", ""), "quantity", minimum=Decimal("0.000000001"))
    quantity_unit = _text(row.get("quantity_unit", ""), "quantity_unit", 40)
    if quantity_unit and quantity_unit not in QUANTITY_UNITS:
        raise ValueError("quantity_unit inconnu pour aeromind.bom.v1")
    material_id = _text(row.get("material_id", ""), "material_id", 160) or None
    source_ref = _text(row.get("source_ref", ""), "source_ref", 500) or None
    mass_text = _text(row.get("unit_mass_kg", ""), "unit_mass_kg", 80)
    mass = _finite_decimal(mass_text, "unit_mass_kg", minimum=Decimal("0")) if mass_text else None
    return {
        "part_id": part_id, "revision": revision, "name": name,
        "quantity": quantity, "quantity_unit": quantity_unit or None,
        "material_id": material_id, "unit_mass_kg": mass, "source_ref": source_ref,
    }


def _normalize_result(row: dict[str, str]) -> dict[str, str]:
    normalized = {key: _text(row.get(key, ""), key, 1024) for key in RESULT_COLUMNS}
    if not all(normalized[key] for key in RESULT_REQUIRED):
        raise ValueError("toutes les colonnes du profil simulation-results.v1 sont requises")
    if normalized["signal"] not in RESULT_SIGNALS:
        raise ValueError("signal inconnu pour aeromind.simulation-results.v1")
    if normalized["unit"] not in RESULT_UNITS:
        raise ValueError("unit inconnue pour aeromind.simulation-results.v1")
    if normalized["frame"] not in RESULT_FRAMES:
        raise ValueError("frame inconnu pour aeromind.simulation-results.v1")
    if normalized["quality_flag"] not in QUALITY_FLAGS:
        raise ValueError("quality_flag inconnu pour aeromind.simulation-results.v1")
    numeric = _finite_decimal(normalized["value"], "value")
    normalized["value"] = numeric
    try:
        stamp = datetime.fromisoformat(normalized["timestamp_utc"].replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("timestamp_utc doit être un timestamp ISO 8601 en UTC") from None
    if stamp.tzinfo is None or stamp.utcoffset() != timezone.utc.utcoffset(stamp):
        raise ValueError("timestamp_utc doit inclure le fuseau UTC")
    normalized["timestamp_utc"] = stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if normalized["signal"].startswith(("position_", "velocity_")) and normalized["frame"] == "none":
        raise ValueError("un signal spatial exige un frame explicite")
    return normalized


def inspect_csv_file(
    source_path: Path,
    normalized_path: Path,
    profile_id: str,
    dialect_id: str,
) -> dict[str, Any]:
    """Validate a versioned CSV profile and write accepted rows as JSON Lines."""
    if profile_id not in CSV_PROFILES:
        raise FileValidationError("PROFILE_UNSUPPORTED", "Profil CSV non pris en charge")
    if dialect_id not in DIALECTS:
        raise FileValidationError("DIALECT_UNSUPPORTED", "Dialecte CSV non pris en charge")
    dialect = DIALECTS[dialect_id]
    try:
        with source_path.open("rb") as prefix_file:
            prefix = prefix_file.read(3)
        has_bom = prefix == b"\xef\xbb\xbf"
        if has_bom and not dialect["requires_bom"]:
            raise FileValidationError("DIALECT_MISMATCH", "Le BOM UTF-8 doit être sélectionné explicitement")
        if dialect["requires_bom"] and not has_bom:
            raise FileValidationError("DIALECT_MISMATCH", "Le dialecte sélectionné exige un BOM UTF-8")
        with source_path.open("r", encoding=dialect["encoding"], newline="") as handle:
            reader = csv.reader(handle, delimiter=dialect["delimiter"], strict=True)
            try:
                headers = next(reader)
            except StopIteration:
                raise FileValidationError("CSV_EMPTY", "Fichier CSV vide") from None
            headers = [header.strip() for header in headers]
            if not headers or len(headers) > MAX_CSV_COLUMNS:
                raise FileValidationError("CSV_HEADER_INVALID", "En-tête vide ou trop large")
            if any(not header for header in headers):
                raise FileValidationError("CSV_HEADER_INVALID", "Nom de colonne vide")
            if len(set(headers)) != len(headers):
                raise FileValidationError("CSV_DUPLICATE_HEADER", "Colonnes dupliquées interdites")
            spec = CSV_PROFILES[profile_id]
            missing = sorted(spec["required"] - set(headers))
            if missing:
                raise FileValidationError("CSV_REQUIRED_COLUMN_MISSING", "Colonnes requises absentes: " + ", ".join(missing))
            extra = [header for header in headers if header not in spec["columns"]]
            warnings: list[dict[str, str]] = []
            if extra:
                warnings.append({"code": "CSV_EXTRA_COLUMNS_IGNORED", "message": "Colonnes hors profil ignorées: " + ", ".join(extra)})
            if dialect_id == "utf8-semicolon-v1":
                warnings.append({"code": "CSV_DIALECT_EXPLICIT", "message": "Le séparateur point-virgule a été sélectionné explicitement."})
            if dialect_id == "utf8-bom-comma-v1":
                warnings.append({"code": "CSV_ENCODING_EXPLICIT", "message": "Le BOM UTF-8 a été sélectionné explicitement."})
            row_errors: list[dict[str, Any]] = []
            accepted = 0
            rejected = 0
            formula_like_count = 0
            seen_bom_ids: set[tuple[str, str]] = set()
            normalized_path.parent.mkdir(parents=True, exist_ok=True)
            with normalized_path.open("x", encoding="utf-8", newline="\n") as output:
                for row_number, values in enumerate(reader, start=2):
                    if row_number - 1 > MAX_CSV_ROWS:
                        raise FileValidationError("CSV_ROW_LIMIT", f"Limite de {MAX_CSV_ROWS} lignes dépassée")
                    if len(values) != len(headers):
                        rejected += 1
                        if len(row_errors) < 100:
                            row_errors.append({"row": row_number, "code": "CSV_ROW_WIDTH", "message": "Nombre de cellules différent de l’en-tête"})
                        continue
                    raw = dict(zip(headers, values))
                    if all(not value.strip() for value in values):
                        continue
                    if any(value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠")) for value in values):
                        formula_like_count += 1
                    try:
                        item = _normalize_bom(raw) if profile_id == "aeromind.bom.v1" else _normalize_result(raw)
                        if profile_id == "aeromind.bom.v1":
                            key = (str(item["part_id"]), str(item["revision"]))
                            if key in seen_bom_ids:
                                raise ValueError("part_id et revision dupliqués")
                            seen_bom_ids.add(key)
                        output.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
                        accepted += 1
                    except (ValueError, InvalidOperation) as exc:
                        rejected += 1
                        if len(row_errors) < 100:
                            row_errors.append({"row": row_number, "code": "CSV_ROW_INVALID", "message": str(exc)[:240]})
            if formula_like_count:
                warnings.append({"code": "CSV_FORMULA_LIKE_TEXT_INERT", "message": f"{formula_like_count} ligne(s) contiennent des cellules ressemblant à des formules; elles ont été traitées comme des données inertes."})
            if rejected:
                warnings.append({"code": "CSV_ROWS_REJECTED", "message": f"{rejected} ligne(s) rejetées; seul un commit explicitement confirmé peut enregistrer les lignes acceptées."})
            if accepted == 0:
                raise FileValidationError("CSV_NO_VALID_ROWS", "Aucune ligne valide à examiner", report={"accepted_records": 0, "rejected_records": rejected, "row_errors": row_errors, "warnings": warnings})
            return {
                "profile_id": profile_id,
                "profile_version": "1.0.0",
                "dialect_id": dialect_id,
                "input_encoding": dialect["encoding"],
                "input_delimiter": dialect["delimiter"],
                "output_dialect": "rfc4180-utf8-comma-v1",
                "accepted_records": accepted,
                "rejected_records": rejected,
                "ignored_columns": extra,
                "row_errors": row_errors,
                "warnings": warnings,
                "sample_records": _read_jsonl_sample(normalized_path, 10),
                "evidence_level": "parsed_and_validated",
                "geometry_imported": False,
                "physical_output_enabled": False,
            }
    except UnicodeDecodeError as exc:
        normalized_path.unlink(missing_ok=True)
        raise FileValidationError("CSV_ENCODING_INVALID", "Le fichier n’est pas un CSV UTF-8 valide") from exc
    except csv.Error as exc:
        normalized_path.unlink(missing_ok=True)
        raise FileValidationError("CSV_SYNTAX_INVALID", f"Syntaxe CSV invalide: {str(exc)[:180]}") from exc
    except FileValidationError:
        normalized_path.unlink(missing_ok=True)
        raise
    except OSError as exc:
        normalized_path.unlink(missing_ok=True)
        raise FileValidationError("FILE_READ_ERROR", "Impossible de lire le fichier importé") from exc


def _read_jsonl_sample(path: Path, limit: int) -> list[dict[str, Any]]:
    sample: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as source:
        for line in source:
            if len(sample) >= limit:
                break
            sample.append(json.loads(line))
    return sample


def inspect_step_part21(source_path: Path) -> dict[str, Any]:
    """Inspect Part 21 envelope/metadata only; never claims B-rep parsing."""
    first_content = True
    current_section: str | None = None
    end_sections = 0
    data_entities = 0
    entity_ids: set[int] = set()
    header_parts: list[str] = []
    header_bytes = 0
    saw_end_marker = False
    after_end_nonempty = False
    external_sections: list[str] = []
    try:
        with source_path.open("rb") as source:
            for raw_line in source:
                if len(raw_line) > MAX_STEP_LINE_BYTES:
                    raise FileValidationError("STEP_LINE_LIMIT", "Ligne STEP supérieure à la limite structurelle")
                try:
                    line = raw_line.decode("utf-8").strip()
                except UnicodeDecodeError as exc:
                    raise FileValidationError("STEP_ENCODING_UNSUPPORTED", "Profil STEP texte UTF-8/ASCII seulement") from exc
                if not line:
                    continue
                upper = line.upper()
                if first_content:
                    first_content = False
                    if upper != "ISO-10303-21;":
                        raise FileValidationError("STEP_HEADER_INVALID", "Marqueur ISO-10303-21 absent")
                    continue
                if saw_end_marker:
                    after_end_nonempty = True
                    continue
                if upper in {"HEADER;", "DATA;", "REFERENCE;", "ANCHOR;"}:
                    current_section = upper[:-1]
                    if current_section in {"REFERENCE", "ANCHOR"}:
                        external_sections.append(current_section)
                    continue
                if upper == "ENDSEC;":
                    end_sections += 1
                    current_section = None
                    continue
                if upper == "END-ISO-10303-21;":
                    saw_end_marker = True
                    continue
                if current_section == "HEADER":
                    header_bytes += len(raw_line)
                    if header_bytes > MAX_STEP_HEADER_BYTES:
                        raise FileValidationError("STEP_HEADER_LIMIT", "En-tête STEP supérieure à la limite")
                    header_parts.append(line)
                elif current_section == "DATA":
                    match = re.match(r"^\s*#(\d+)\s*=", line)
                    if match:
                        number = int(match.group(1))
                        if number in entity_ids:
                            raise FileValidationError("STEP_DUPLICATE_ENTITY_ID", f"Identifiant d’entité STEP dupliqué: #{number}")
                        entity_ids.add(number)
                        data_entities += 1
                        if data_entities > MAX_STEP_ENTITIES:
                            raise FileValidationError("STEP_ENTITY_LIMIT", f"Limite de {MAX_STEP_ENTITIES} entités dépassée")
        if first_content or not saw_end_marker or after_end_nonempty or end_sections < 2 or data_entities == 0:
            raise FileValidationError("STEP_STRUCTURE_INVALID", "Structure Part 21 incomplète ou sans entités DATA")
        if external_sections:
            raise FileValidationError("STEP_EXTERNAL_SECTION_UNSUPPORTED", "Les sections REFERENCE/ANCHOR externes ne sont pas prises en charge")
        header = "\n".join(header_parts)
        schemas_match = re.search(r"FILE_SCHEMA\s*\(\s*\((.*?)\)\s*\)\s*;", header, re.IGNORECASE | re.DOTALL)
        if not schemas_match:
            raise FileValidationError("STEP_SCHEMA_MISSING", "FILE_SCHEMA absent ou non reconnu")
        schemas = re.findall(r"['\"]([^'\"]+)['\"]", schemas_match.group(1))
        if not schemas:
            raise FileValidationError("STEP_SCHEMA_INVALID", "FILE_SCHEMA ne contient aucun identifiant")
        known_schema = any(re.search(r"AP\s*(?:203|214|242)", schema, re.IGNORECASE) for schema in schemas)
        warnings = [{"code": "STEP_GEOMETRY_NOT_PARSED", "message": "Inspection structurelle uniquement: aucune géométrie B-rep, PMI, tolérance ou historique paramétrique n’a été extraite."}]
        if not known_schema:
            warnings.append({"code": "STEP_AP_UNVERIFIED", "message": "Le protocole d’application n’est pas dans la liste de profils metadata reconnus; l’artefact brut reste non interprété."})
        return {
            "profile_id": "aeromind.step.p21.inspect.v1",
            "profile_version": "1.0.0",
            "part21_envelope_valid": True,
            "file_schema": schemas,
            "recognized_ap_family": known_schema,
            "data_entity_count": data_entities,
            "geometry_imported": False,
            "pmi_imported": False,
            "parametric_history_imported": False,
            "external_references_followed": False,
            "capability_verified": "step.p21.inspect",
            "capability_unavailable": ["step.geometry.import", "step.geometry.export", "step.ap242.pmi"],
            "accepted_records": 1,
            "rejected_records": 0,
            "row_errors": [],
            "warnings": warnings,
            "evidence_level": "structure_only",
            "physical_output_enabled": False,
        }
    except OSError as exc:
        raise FileValidationError("FILE_READ_ERROR", "Impossible de lire le fichier STEP importé") from exc


def export_csv_file(normalized_path: Path, output_path: Path, profile_id: str, export_format: str) -> int:
    """Export normalized JSONL to canonical or spreadsheet-display CSV."""
    if profile_id not in CSV_PROFILES:
        raise FileValidationError("EXPORT_PROFILE_UNSUPPORTED", "Profil non exportable")
    if export_format not in {"machine-canonical", "spreadsheet-safe"}:
        raise FileValidationError("EXPORT_FORMAT_UNSUPPORTED", "Format d’export non pris en charge")
    columns = CSV_PROFILES[profile_id]["columns"]
    rows = 0

    def safe_cell(value: Any, column: str) -> str:
        text = "" if value is None else str(value)
        numeric_columns = {"quantity", "unit_mass_kg", "value"}
        if export_format == "spreadsheet-safe" and column not in numeric_columns and text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠")):
            # Deliberate, visible data change for common spreadsheet consumers.
            return "\t" + text
        return text

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with normalized_path.open("r", encoding="utf-8") as source, output_path.open("x", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore", dialect="excel", lineterminator="\r\n")
        writer.writeheader()
        for line in source:
            record = json.loads(line)
            writer.writerow({key: safe_cell(record.get(key), key) for key in columns})
            rows += 1
            if rows > MAX_CSV_ROWS:
                raise FileValidationError("EXPORT_ROW_LIMIT", "Limite de lignes exportable dépassée")
    return rows
