"""Tests for v13 voice command parser."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)

from web.voice_commands import parse_voice_command  # noqa: E402


def test_parse_takeoff_fr():
    result = parse_voice_command("décolle à 5 mètres")
    assert result is not None
    assert result["command"] == "NAV_TAKEOFF"
    assert result["parameters"]["p7"] == 5.0
    assert "5.0 m" in result["preview"]


def test_parse_takeoff_en():
    result = parse_voice_command("take off to 10 meters")
    assert result is not None
    assert result["command"] == "NAV_TAKEOFF"
    assert result["parameters"]["p7"] == 10.0


def test_parse_takeoff_default_altitude():
    result = parse_voice_command("décolle")
    assert result is not None
    assert result["command"] == "NAV_TAKEOFF"
    assert result["parameters"]["p7"] == 5.0  # default


def test_parse_land_fr():
    result = parse_voice_command("atterris")
    assert result is not None
    assert result["command"] == "NAV_LAND"
    assert result["parameters"] == {}


def test_parse_land_en():
    result = parse_voice_command("land")
    assert result is not None
    assert result["command"] == "NAV_LAND"


def test_parse_rtl_fr():
    result = parse_voice_command("reviens à la base")
    assert result is not None
    assert result["command"] == "NAV_RETURN_TO_LAUNCH"


def test_parse_rtl_en():
    result = parse_voice_command("return to launch")
    assert result is not None
    assert result["command"] == "NAV_RETURN_TO_LAUNCH"


def test_parse_arm_fr():
    result = parse_voice_command("arme le drone")
    assert result is not None
    assert result["command"] == "COMPONENT_ARM_DISARM"
    assert result["parameters"]["p1"] == 1.0


def test_parse_disarm_fr():
    result = parse_voice_command("désarme")
    assert result is not None
    assert result["command"] == "COMPONENT_ARM_DISARM"
    assert result["parameters"]["p1"] == 0.0


def test_parse_estop_fr():
    result = parse_voice_command("arrêt d'urgence")
    assert result is not None
    assert result["command"] == "EMERGENCY_STOP"
    assert result.get("is_estop") is True


def test_parse_estop_en():
    result = parse_voice_command("emergency stop")
    assert result is not None
    assert result["command"] == "EMERGENCY_STOP"
    assert result.get("is_estop") is True


def test_parse_unrecognized():
    result = parse_voice_command("fait il beau aujourd'hui")
    assert result is None


def test_parse_empty():
    result = parse_voice_command("")
    assert result is None


def test_parse_none():
    result = parse_voice_command(None)  # type: ignore
    assert result is None


def test_parse_takeoff_decimal():
    result = parse_voice_command("décolle à 7,5 mètres")
    assert result is not None
    assert result["parameters"]["p7"] == 7.5


def test_parse_takeoff_with_punctuation():
    result = parse_voice_command("Décolle à 5 mètres !")
    assert result is not None
    assert result["command"] == "NAV_TAKEOFF"
    assert result["parameters"]["p7"] == 5.0


def test_parse_arm_not_disarm():
    """Ensure 'arme' doesn't match 'désarme'."""
    result = parse_voice_command("désarme le drone")
    assert result is not None
    assert result["parameters"]["p1"] == 0.0  # disarm, not arm
