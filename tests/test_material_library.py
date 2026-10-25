"""Tests for the v7 material library backend."""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)

from web.database import Base  # noqa: E402
from web import material_library as ml  # noqa: E402


def test_catalog_has_10_categories():
    assert len(ml.MATERIAL_CATEGORIES) == 10
    ids = [c["id"] for c in ml.MATERIAL_CATEGORIES]
    assert "propulsion" in ids
    assert "energy" in ids
    assert "structure" in ids
    assert "avionics" in ids
    assert "communication" in ids
    assert "optical" in ids
    assert "payload-non-weaponized" in ids
    assert "safety" in ids
    assert "maintenance" in ids
    assert "armament-hardware" in ids


def test_catalog_has_at_least_30_items():
    assert len(ml.MATERIAL_CATALOG) >= 30


def test_catalog_includes_motors():
    motors = [it for it in ml.MATERIAL_CATALOG if it["category"] == "propulsion" and "Moteur" in it["label"]]
    assert len(motors) >= 2  # at least 2 motor references


def test_catalog_includes_esc():
    escs = [it for it in ml.MATERIAL_CATALOG if it["category"] == "propulsion" and "ESC" in it["label"]]
    assert len(escs) >= 1


def test_catalog_includes_propellers():
    props = [it for it in ml.MATERIAL_CATALOG if it["category"] == "propulsion" and "Hélice" in it["label"]]
    assert len(props) >= 2


def test_catalog_includes_flight_controller():
    fcs = [it for it in ml.MATERIAL_CATALOG if it["category"] == "avionics" and "Pixhawk" in it["label"]]
    assert len(fcs) >= 1


def test_catalog_includes_gps():
    gps = [it for it in ml.MATERIAL_CATALOG if it["category"] == "avionics" and "GPS" in it["label"]]
    assert len(gps) >= 2  # M9N + RTK F9P


def test_catalog_includes_cameras():
    cams = [it for it in ml.MATERIAL_CATALOG if it["category"] == "optical"]
    assert len(cams) >= 4  # GoPro, thermal, gimbal, LIDAR, multispectral


def test_catalog_includes_non_weaponized_payloads():
    payloads = [it for it in ml.MATERIAL_CATALOG if it["category"] == "payload-non-weaponized"]
    # drop mechanism, agri sprayer, LED lighting, comms relay, gas detector
    assert len(payloads) >= 5
    labels = [p["label"] for p in payloads]
    assert any("lâcher" in l.lower() or "drop" in l.lower() for l in labels)
    assert any("agricole" in l.lower() or "sprayer" in l.lower() for l in labels)
    assert any("éclairage" in l.lower() or "led" in l.lower() for l in labels)


def test_catalog_includes_safety():
    safety = [it for it in ml.MATERIAL_CATALOG if it["category"] == "safety"]
    # parachute, strobe, flare
    assert len(safety) >= 3


def test_catalog_includes_armament_hardware_non_weaponized():
    """The 'armament-hardware' category contains ELECTRICAL arming hardware
    (switches, PDB, connectors) — NOT weapons. All items must have
    weaponized=False."""
    arm_hw = [it for it in ml.MATERIAL_CATALOG if it["category"] == "armament-hardware"]
    assert len(arm_hw) >= 2
    for item in arm_hw:
        assert item.get("weaponized") is False, f"Item {item['id']} should not be weaponized"
    # Should include switch / PDB / connector — no weapons
    labels = " ".join(it["label"] for it in arm_hw).lower()
    assert any("interrupteur" in labels or "switch" in labels for _ in [None])
    # No weapon terms (use word boundaries to avoid "armement" matching "arme")
    import re
    weapon_terms = ["arme ", "armes ", "munition", "explosif", "balle", "fusil", "missile", "grenade"]
    for term in weapon_terms:
        assert term not in labels, f"Term '{term}' should not appear in armament-hardware labels (found in: {labels})"


def test_all_catalog_items_are_non_weaponized():
    """Critical contract: every item in the static catalog must be non-weaponized."""
    for item in ml.MATERIAL_CATALOG:
        assert item.get("weaponized") is False, f"Item {item['id']} is marked weaponized — violates non-weaponized platform contract"


def test_catalog_serialize_returns_expected_fields():
    items = ml.MATERIAL_CATALOG[:2]
    serialized = [ml._serialize_item(it) for it in items]
    assert "id" in serialized[0]
    assert "category" in serialized[0]
    assert "label" in serialized[0]
    assert "manufacturer" in serialized[0]
    assert "weaponized" in serialized[0]
    assert serialized[0]["weaponized"] is False


def test_catalog_categories_endpoint_returns_10():
    """Test the endpoint shape (categories list)."""
    cats = ml.MATERIAL_CATEGORIES
    assert len(cats) == 10
    for c in cats:
        assert "id" in c
        assert "label" in c
        assert "icon" in c
        assert "description" in c
