"""AeroMind Sprint 2: bounded volumetric inspection and scan-to-CAD metrology.

This module deliberately exposes the physical calculation pipeline instead of a
visual placeholder. It accepts explicit, documented interchange profiles:
- CT volumes: JSON voxel grid or NumPy .npy (float32/float64), with spacing in mm.
- Scan/CAD: ASCII PLY, ASCII/binary STL, or JSON {points|vertices} in declared units.
E57 and proprietary CT containers are rejected rather than silently approximated.
The result is a reproducible report with hashes, units, iteration count and limits.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import struct
from typing import Any

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/inspection", tags=["quality-inspection"])
MAX_UPLOAD_BYTES = 32 * 1024 * 1024
MAX_VOXELS = 128 * 128 * 128
MAX_POINTS = 50_000
MAX_RESULT_POINTS = 5_000
SUPPORTED_VOLUME = {".json", ".npy"}
SUPPORTED_GEOMETRY = {".ply", ".stl", ".json"}

class VolumeMeta(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    dimensions: list[int] = Field(min_length=3, max_length=3)
    spacing_mm: list[float] = Field(min_length=3, max_length=3)
    origin_mm: list[float] = Field(default=[0.0, 0.0, 0.0], min_length=3, max_length=3)
    density_min: float | None = None
    density_max: float | None = None

class MetrologyOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    units: str = Field(default="mm", pattern="^(mm|m|um)$")
    max_iterations: int = Field(default=30, ge=1, le=100)
    tolerance_um: float = Field(default=50.0, ge=0.001, le=1_000_000)
    sample_limit: int = Field(default=5_000, ge=100, le=MAX_RESULT_POINTS)

class InspectError(ValueError):
    pass

def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _suffix(filename: str) -> str:
    return "." + filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

async def _read_upload(file: UploadFile, allowed: set[str]) -> tuple[str, bytes]:
    name = (file.filename or "").replace("\\", "/").split("/")[-1]
    suffix = _suffix(name)
    if suffix not in allowed:
        raise HTTPException(415, f"Format non pris en charge: {suffix or 'sans extension'}")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Artefact supérieur à 32 MiB")
    return name, data

def _validate_dims(dims: list[int]) -> tuple[int, int, int]:
    if any(int(v) < 2 or int(v) > 512 for v in dims):
        raise InspectError("dimensions voxels hors limites (2..512)")
    shape = tuple(int(v) for v in dims)
    if math.prod(shape) > MAX_VOXELS:
        raise InspectError(f"volume limité à {MAX_VOXELS} voxels")
    return shape  # type: ignore[return-value]

def _volume_from_json(data: bytes) -> tuple[np.ndarray, VolumeMeta]:
    raw = json.loads(data.decode("utf-8"))
    meta = VolumeMeta.model_validate({key: raw[key] for key in ("dimensions", "spacing_mm", "origin_mm", "density_min", "density_max") if key in raw})
    shape = _validate_dims(meta.dimensions)
    values = np.asarray(raw.get("values", []), dtype=np.float32)
    if values.size != math.prod(shape):
        raise InspectError("values doit contenir exactement dimensions[0]*dimensions[1]*dimensions[2] valeurs")
    if any(not math.isfinite(float(v)) for v in meta.spacing_mm) or any(float(v) <= 0 for v in meta.spacing_mm):
        raise InspectError("spacing_mm doit être strictement positif et fini")
    return values.reshape(shape), meta

def _volume_from_npy(data: bytes) -> tuple[np.ndarray, VolumeMeta]:
    try:
        values = np.load(io.BytesIO(data), allow_pickle=False)
    except Exception as exc:
        raise InspectError("fichier NPY invalide") from exc
    if values.ndim != 3:
        raise InspectError("un NPY CT doit être un tableau 3D")
    shape = _validate_dims(list(values.shape))
    values = np.asarray(values, dtype=np.float32)
    return values.reshape(shape), VolumeMeta(dimensions=list(shape), spacing_mm=[1.0, 1.0, 1.0])

def _volume_report(values: np.ndarray, meta: VolumeMeta, filename: str, source_hash: str) -> dict[str, Any]:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        raise InspectError("volume sans valeur finie")
    lo = float(meta.density_min if meta.density_min is not None else np.min(finite))
    hi = float(meta.density_max if meta.density_max is not None else np.max(finite))
    if not math.isfinite(lo) or not math.isfinite(hi) or hi <= lo:
        raise InspectError("plage de densité invalide")
    normalized = np.clip((np.nan_to_num(values, nan=lo) - lo) / (hi - lo), 0, 1)
    # The browser ray marcher needs a bounded texture. Keep the source geometry
    # exact in the report while returning a compact float texture for interaction.
    texture = normalized.astype(np.float32).flatten().tolist()
    return {
        "schema_version": "aeromind.ct-volume.v1",
        "filename": filename,
        "input_sha256": source_hash,
        "dimensions": list(values.shape),
        "spacing_mm": [float(x) for x in meta.spacing_mm],
        "origin_mm": [float(x) for x in meta.origin_mm],
        "density_range": {"min": lo, "max": hi},
        "voxel_count": int(values.size),
        "texture_values": texture,
        "texture_layout": "x-fastest row-major z-slices",
        "evidence_level": "decoded_voxel_grid",
        "warnings": ["Densité calibrée par les bornes fournies ou observées; aucune courbe HU constructeur n'est inférée.", "Résultat d'inspection, pas une certification de pièce ou de matériau."],
    }

def _parse_json_points(data: bytes) -> np.ndarray:
    raw = json.loads(data.decode("utf-8"))
    points = raw.get("points", raw.get("vertices", raw if isinstance(raw, list) else None))
    if points is None:
        raise InspectError("JSON géométrique: clé points ou vertices absente")
    return np.asarray(points, dtype=np.float64)

def _parse_ply(data: bytes) -> np.ndarray:
    text = data.decode("utf-8", errors="strict")
    lines = text.splitlines()
    if not lines or lines[0].strip().lower() != "ply":
        raise InspectError("en-tête PLY absent")
    count = 0; end = None
    for i, line in enumerate(lines):
        if line.startswith("element vertex "): count = int(line.split()[-1])
        if line.strip() == "end_header": end = i + 1; break
    if not end or count <= 0 or count > MAX_POINTS: raise InspectError("PLY: section vertex invalide")
    rows = [line.split()[:3] for line in lines[end:end + count]]
    return np.asarray(rows, dtype=np.float64)

def _parse_stl(data: bytes) -> np.ndarray:
    # Binary STL is identified by its exact 84-byte triangle count contract.
    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + 50 * n == len(data) and n <= MAX_POINTS // 3:
            rows = []
            for i in range(n):
                base = 84 + i * 50
                coords = struct.unpack_from("<9f", data, base + 12)
                rows.extend((coords[0:3], coords[3:6], coords[6:9]))
            return np.asarray(rows, dtype=np.float64).reshape(-1, 3)
    text = data.decode("utf-8", errors="strict")
    rows = []
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) == 4 and parts[0].lower() == "vertex": rows.append(parts[1:])
    if not rows: raise InspectError("STL sans sommets reconnus")
    return np.asarray(rows, dtype=np.float64)

def _parse_geometry(data: bytes, suffix: str) -> np.ndarray:
    if suffix == ".json": points = _parse_json_points(data)
    elif suffix == ".ply": points = _parse_ply(data)
    elif suffix == ".stl": points = _parse_stl(data)
    else: raise InspectError("format géométrique non pris en charge")
    if points.ndim != 2 or points.shape[1] != 3 or not (3 <= len(points) <= MAX_POINTS):
        raise InspectError(f"nuage de points invalide ou limité à {MAX_POINTS} points")
    if not np.isfinite(points).all(): raise InspectError("coordonnées non finies")
    return points

def _unit_factor(units: str) -> float:
    return {"m": 1.0, "mm": 1e-3, "um": 1e-6}[units]

def _kabsch(source: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a = source - source.mean(axis=0); b = target - target.mean(axis=0)
    u, _, vt = np.linalg.svd(a.T @ b)
    r = vt.T @ u.T
    if np.linalg.det(r) < 0:
        vt[-1] *= -1; r = vt.T @ u.T
    t = target.mean(axis=0) - source.mean(axis=0) @ r.T
    return r, t

def _sample(points: np.ndarray, limit: int) -> np.ndarray:
    if len(points) <= limit: return points
    idx = np.linspace(0, len(points) - 1, limit).astype(int)
    return points[idx]

def _best_fit(scan: np.ndarray, cad: np.ndarray, options: MetrologyOptions) -> tuple[np.ndarray, np.ndarray, int, float]:
    scan_fit = scan.copy()
    last = float("inf")
    for iteration in range(1, options.max_iterations + 1):
        # Deterministic nearest-vertex correspondence. This is a bounded ICP
        # kernel; triangles are represented by their imported tessellation.
        delta = scan_fit[:, None, :] - cad[None, :, :]
        distances = np.sum(delta * delta, axis=2)
        nearest = np.argmin(distances, axis=1)
        target = cad[nearest]
        r, t = _kabsch(scan_fit, target)
        updated = scan_fit @ r.T + t
        rms = float(np.sqrt(np.mean(np.sum((updated - target) ** 2, axis=1))))
        scan_fit = updated
        if abs(last - rms) < 1e-9: return scan_fit, target, iteration, rms
        last = rms
    return scan_fit, target, options.max_iterations, last

@router.get("/capabilities")
def capabilities() -> dict[str, Any]:
    return {"schema_version": "aeromind.inspection-capabilities.v1", "ct": {"formats": ["json", "npy"], "engine": "normalized-volume-ray-march", "max_voxels": MAX_VOXELS}, "metrology": {"formats": ["json", "ply", "stl"], "alignment": "iterative-closest-vertex-best-fit", "deviation_unit": "micrometre", "max_points": MAX_POINTS}, "e57": "rejected_explicitly_until_native_reader_is deployed", "institutional_certification": False}

@router.post("/volume/import")
async def import_volume(file: UploadFile = File(...), meta: str | None = None) -> dict[str, Any]:
    filename, data = await _read_upload(file, SUPPORTED_VOLUME)
    try:
        values, parsed = _volume_from_json(data) if _suffix(filename) == ".json" else _volume_from_npy(data)
        if meta:
            parsed = VolumeMeta.model_validate({**parsed.model_dump(), **json.loads(meta)})
        return _volume_report(values, parsed, filename, _hash(data))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(422, f"Volume CT rejeté: {str(exc)[:240]}") from None

@router.post("/metrology/compare")
async def compare_metrology(scan: UploadFile = File(...), cad: UploadFile = File(...), options: str | None = None) -> dict[str, Any]:
    scan_name, scan_data = await _read_upload(scan, SUPPORTED_GEOMETRY)
    cad_name, cad_data = await _read_upload(cad, SUPPORTED_GEOMETRY)
    try:
        opts = MetrologyOptions.model_validate(json.loads(options) if options else {})
        scan_points = _parse_geometry(scan_data, _suffix(scan_name))
        cad_points = _parse_geometry(cad_data, _suffix(cad_name))
        factor = _unit_factor(opts.units)
        scan_m = scan_points * factor; cad_m = cad_points * factor
        scan_fit, target, iterations, rms_m = _best_fit(_sample(scan_m, opts.sample_limit), _sample(cad_m, MAX_RESULT_POINTS), opts)
        deviations_um = np.linalg.norm(scan_fit - target, axis=1) * 1_000_000
        return {"schema_version": "aeromind.scan-to-cad.v1", "scan": {"filename": scan_name, "sha256": _hash(scan_data), "input_points": len(scan_points)}, "cad": {"filename": cad_name, "sha256": _hash(cad_data), "input_points": len(cad_points)}, "units": opts.units, "alignment": {"method": "iterative-closest-vertex-best-fit", "iterations": iterations, "rms_um": rms_m * 1_000_000, "converged": iterations < opts.max_iterations or rms_m <= opts.tolerance_um * 1e-6}, "tolerance_um": opts.tolerance_um, "deviation": {"min_um": float(np.min(deviations_um)), "max_um": float(np.max(deviations_um)), "mean_um": float(np.mean(deviations_um)), "p95_um": float(np.percentile(deviations_um, 95)), "out_of_tolerance": int(np.count_nonzero(deviations_um > opts.tolerance_um))}, "points": [{"x": float(p[0] / factor), "y": float(p[1] / factor), "z": float(p[2] / factor), "deviation_um": float(d)} for p, d in zip(scan_fit, deviations_um)], "evidence_level": "aligned_sampled_point_cloud", "warnings": ["Les écarts sont calculés vers la tessellation CAO importée, sans inférence de surface B-rep.", "La couleur encode l'écart absolu; le signe normal nécessite une normale de surface CAO qualifiée.", "Résultat de contrôle à revoir par un métrologue habilité."]}
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError, np.linalg.LinAlgError) as exc:
        raise HTTPException(422, f"Comparaison métrologique rejetée: {str(exc)[:240]}") from None
