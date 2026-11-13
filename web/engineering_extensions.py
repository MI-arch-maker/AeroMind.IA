"""Extensions d'ingénierie importées du projet final AeroMind.

Ce module est volontairement lecture seule : il ne pilote aucun matériel, ne
charge aucune mission et ne contient ni MAVLink ni fonction d'armement.
"""
from __future__ import annotations

import hashlib
import json
import math
import secrets
from typing import Any

import numpy as np
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel, Field

from .oidc import require_session

router = APIRouter(prefix="/api/engineering", tags=["engineering-extensions"])


# --- CFD 2D légère, adaptée du module cfd_panel.py fourni ---
def naca4(code: str = "2412", n_half: int = 40) -> np.ndarray:
    if len(code) != 4 or not code.isdigit() or code[0] == "9":
        raise ValueError("Profil NACA 4 chiffres attendu")
    m, p, t = int(code[0]) / 100.0, int(code[1]) / 10.0, int(code[2:]) / 100.0
    b = np.linspace(0.0, math.pi, n_half + 1)
    x = 0.5 * (1.0 - np.cos(b))
    yt = 5 * t * (0.2969 * np.sqrt(x) - 0.1260 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)
    if m and p:
        yc = np.where(x < p, m / p**2 * (2 * p * x - x**2), m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * x - x**2))
        dy = np.where(x < p, 2 * m / p**2 * (p - x), 2 * m / (1 - p) ** 2 * (p - x))
    else:
        yc, dy = np.zeros_like(x), np.zeros_like(x)
    theta = np.arctan(dy)
    upper = np.column_stack([x - yt * np.sin(theta), yc + yt * np.cos(theta)])[::-1]
    lower = np.column_stack([x + yt * np.sin(theta), yc - yt * np.cos(theta)])[1:-1]
    return np.vstack([upper, lower])


def estimate_airfoil(code: str, alpha_deg: float, reynolds: float, aspect_ratio: float | None) -> dict[str, Any]:
    points = naca4(code)
    thickness = int(code[2:]) / 100.0
    alpha = math.radians(alpha_deg)
    cl_ideal = 2 * math.pi * alpha + 0.12 * (int(code[0]) / 10.0)
    cf = 0.074 / max(reynolds, 10_000.0) ** 0.2
    cd0 = 2 * cf * (1 + 2 * thickness + 60 * thickness**4)
    cdi = cl_ideal**2 / (math.pi * aspect_ratio * 0.85) if aspect_ratio else 0.0
    stall_margin = max(0.0, abs(alpha_deg) - (8.0 + 40.0 * thickness))
    cl = cl_ideal * (1.0 - min(0.65, stall_margin / 20.0))
    cd = cd0 + cdi + 0.015 * min(1.0, stall_margin / 8.0)
    return {
        "code": code,
        "alpha_deg": alpha_deg,
        "reynolds": reynolds,
        "aspect_ratio": aspect_ratio,
        "cl": round(cl, 5),
        "cd_estimate": round(cd, 6),
        "lift_to_drag": round(cl / cd, 3) if cd > 0 else None,
        "points": [[round(float(x), 6), round(float(y), 6)] for x, y in points[::4]],
        "method": "NACA 4 chiffres · estimation préliminaire isolée",
        "limitations": ["ne remplace pas OpenFOAM", "ne remplace pas un essai physique", "revue humaine requise"],
    }


class AirfoilBody(BaseModel):
    code: str = Field("2412", pattern=r"^[0-9]{4}$")
    alpha_deg: float = Field(4.0, ge=-25, le=25)
    reynolds: float = Field(1_000_000.0, ge=10_000, le=100_000_000)
    aspect_ratio: float | None = Field(None, gt=0, le=100)


@router.post("/cfd/airfoil")
def airfoil(body: AirfoilBody, aeromind_session: str | None = Cookie(default=None)):
    require_session(aeromind_session)
    try:
        return estimate_airfoil(body.code, body.alpha_deg, body.reynolds, body.aspect_ratio)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


ENERGY_SOURCES = {
    "lipo": {"label": "Batterie LiPo", "wh_per_kg": 180.0, "efficiency": 0.80},
    "liion": {"label": "Batterie Li-ion", "wh_per_kg": 250.0, "efficiency": 0.80},
}


class PropulsionBody(BaseModel):
    mass_kg: float = Field(7.0, gt=0, le=1000)
    energy_kg: float = Field(1.0, gt=0, le=500)
    cruise_speed_mps: float = Field(20.0, gt=0, le=200)
    lift_to_drag: float = Field(10.0, gt=1, le=100)
    sources: list[str] = ["lipo", "liion"]


@router.post("/propulsion/compare")
def propulsion(body: PropulsionBody, aeromind_session: str | None = Cookie(default=None)):
    require_session(aeromind_session)
    power_w = body.mass_kg * 9.81 * body.cruise_speed_mps / body.lift_to_drag / 0.70
    results = []
    for key in body.sources:
        source = ENERGY_SOURCES.get(key)
        if not source:
            continue
        usable_wh = body.energy_kg * source["wh_per_kg"] * source["efficiency"]
        results.append({"key": key, "label": source["label"], "power_w": round(power_w), "usable_wh": round(usable_wh), "endurance_h": round(usable_wh / power_w, 3)})
    return {"mode": "lecture seule", "power_w": round(power_w), "results": results, "hardware_control": False}


_CERT_PRIVATE_KEY: Ed25519PrivateKey | None = None


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


class EvidenceBody(BaseModel):
    project_id: str = Field(min_length=1, max_length=120)
    run_id: str = Field(min_length=1, max_length=120)
    evidence_summary: str = Field(min_length=1, max_length=2000)


@router.post("/evidence/certificate")
def evidence_certificate(body: EvidenceBody, aeromind_session: str | None = Cookie(default=None)):
    identity = require_session(aeromind_session)
    global _CERT_PRIVATE_KEY
    if _CERT_PRIVATE_KEY is None:
        _CERT_PRIVATE_KEY = Ed25519PrivateKey.generate()
    payload = {"project_id": body.project_id, "run_id": body.run_id, "summary": body.evidence_summary, "issuer": identity, "scope": "preuve interne AeroMind"}
    document = {"type": "AeroMind.InternalEvidence", "serial": f"AM-EV-{secrets.token_hex(5).upper()}", "payload": payload, "disclaimer": "Preuve interne non réglementaire; aucune certification aéronautique."}
    document["sha256"] = hashlib.sha256(_canonical(document)).hexdigest()
    document["signature"] = _CERT_PRIVATE_KEY.sign(bytes.fromhex(document["sha256"])).hex()
    return document
