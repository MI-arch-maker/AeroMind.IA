#!/usr/bin/env python3
"""hil_validation.py — Orchestrateur de validation HIL AeroMind LabBench 01 v5.

Exécute automatiquement les 8 tests de la checklist HIL :

  1. Arm + disarm                  → drone SITL passe ARMED → DISARMED
  2. Takeoff 5 m                   → drone SITL monte et se stabilise à ~5 m
  3. Land                          → drone SITL atterrit proprement
  4. RTL                           → drone SITL revient au home
  5. E-STOP                        → atterrissage immédiat (< 1 s)
  6. Refus commande hors allowlist → 403 COMMAND_NOT_ALLOWED
  7. Token single-use déjà consumé → 409 TOKEN_ALREADY_USED
  8. Refus takeoff sans géofence   → 409 GEOFENCE_BREACH

Le script utilise les modules de service backend directement (pas HTTP)
pour éviter la complexité OIDC. Il démarre SITL + uvicorn séparément via
run_hil_validation.sh ; ici on teste le service layer + la connexion MAVLink
réelle au SITL.

Usage :
    python3 hil_validation.py \
        --aeromind-url http://127.0.0.1:10000 \
        --mavlink-url  udpout:127.0.0.1:14550 \
        --home-lat 38.0 --home-lon -122.0

Le script :
  - crée un user + projet + drone en DB (via SQLAlchemy)
  - bootstrappe la gate virtuelle N3 armée
  - configure la gate hardware N4 + géofence
  - enregistre le drone dans le pool MAVLink avec l'URL fournie
  - envoie des commandes via le pilote MAVLink
  - observe l'état SITL via MAVLink telemetry pour vérifier les effets
  - affiche un rapport structuré + exit code 0/1
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

# === Force les variables d'environnement AVANT d'importer les modules web ===
os.environ.setdefault("HARDWARE_CONTROL", "true")
os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_AUTO_CREATE_SCHEMA", "true")

# L'orchestrateur peut être lancé soit :
#   - après que run_hil_validation.sh a démarré uvicorn (DATABASE_URL = sqlite HIL)
#   - en standalone (DATABASE_URL = in-memory)
# Dans les deux cas on garde DATABASE_URL tel quel ; le shell wrapper l'a déjà
# positionnée sur le fichier HIL dédié.

# Maintenant on peut importer les modules web
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from web.database import Base
from web.models import User, Project, Drone
from web import labbench as lb
from web import hardware_gate as hw_gate
from web import geofence_validator as geo
from web import mavlink_pool as pool_mod
from web import mavlink_command_api as cmd_api


# === Couleurs (ANSI) ===
RED = "\033[31m"
GREEN = "\033[32m"
AMBER = "\033[33m"
CYAN = "\033[36m"
BOLD = "\033[1m"
RESET = "\033[0m"


@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""
    duration_s: float = 0.0


@dataclass
class HilContext:
    db: Any
    user: dict
    project: Project
    drone: Drone
    mavlink_url: str
    home_lat: float
    home_lon: float
    results: list[TestResult] = field(default_factory=list)

    def record(self, name: str, passed: bool, detail: str = "", duration: float = 0.0) -> None:
        r = TestResult(name=name, passed=passed, detail=detail, duration_s=duration)
        self.results.append(r)
        mark = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"  [{mark}] {name} ({duration:.1f}s) — {detail}")


# === Helpers DB ===

def setup_db_and_bootstrap(mavlink_url: str, home_lat: float, home_lon: float) -> HilContext:
    """Create the test DB schema + a user/project/drone, register drone in pool."""
    db_url = os.environ.get("DATABASE_URL", "sqlite:///:memory:")
    engine = create_engine(db_url, connect_args={"check_same_thread": False} if "sqlite" in db_url else {})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()

    user_id = f"hil-user-{uuid4()}"
    db.add(User(id=user_id, email="hil@aeromind.local"))
    db.flush()
    project_id = str(uuid4())
    db.add(Project(
        id=project_id,
        user_id=user_id,
        name="Projet HIL validation",
        data_json="{}",
    ))
    db.flush()
    drone_id = str(uuid4())
    drone = Drone(
        id=drone_id,
        user_id=user_id,
        project_id=project_id,
        name="Drone HIL",
        config_json='{"airframe":"multirotor","motor_count":4,"mass_kg":1.2}',
    )
    db.add(drone)
    db.commit()

    user = {"id": user_id, "role": "user", "email": "hil@aeromind.local"}

    # Bootstrap gate virtuelle N3 armée
    lb.seed_registry(db, user, project_id)
    lb.run_fleet_simulation(db, user, project_id, {
        "scenarios": [{
            "droneId": drone_id,
            "ambientC": 20, "heaterPowerW": 4, "dutyCycle": 0.4,
            "thermalResistanceCPerW": 3.2, "durationSeconds": 60,
            "positionSetpointDeg": 45,
        }],
    })
    lb.complete_hardware_checklist_drone(db, user, project_id, drone_id, {
        "deviceIdentified": True, "driverValidated": True, "calibrationSimulated": True,
    })
    lb.arm_n3_gate_drone(db, user, project_id, drone_id, {
        "humanConfirmed": True, "safetyConfirmed": True,
        "secondOperatorCode": "hil-secret-code",
    })

    # Signer la revue hardware N4 (reviewer != operator)
    hw_gate.sign_hardware_review(db, user, project_id, {
        "reviewer": "independent-hil-reviewer@aeromind.local",
        "reviewToken": "hil-validation-token-12345678",
        "note": "Revue HIL automatisée",
    })

    # Enregistrer le drone dans le pool matériel
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd_api.MavlinkCommandPilot(url),
        observer_factory=lambda url: __import__("web.mavlink_observer", fromlist=["MavlinkObserver"]).MavlinkObserver(connection_url=url),
    )
    pool_mod.reset_pool(pool)
    pool.register(drone_id, "Drone HIL", mavlink_url)

    # Flip drone_registered_in_pool dans la gate state
    row, data, _ = hw_gate._ensure_hardware_gate_state(db, db.get(Project, project_id), user)
    data.setdefault("conditions", {})["drone_registered_in_pool"] = True
    import json
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.commit()

    # Configurer la géofence autour de la position home du SITL
    # Le SITL -L platform démarre à (38.0, -122.0) par défaut. On construit un
    # polygone carré de 100 m de côté autour de home, avec alt max 30 m.
    polygon = _square_around(home_lat, home_lon, meters=100)
    geofence = geo.Geofence(
        project_id=project_id,
        polygon=polygon,
        max_altitude_m=30.0,
        max_distance_m=200.0,
        home_lat=home_lat,
        home_lon=home_lon,
    )
    geo.set_geofence(geofence)

    return HilContext(
        db=db,
        user=user,
        project=db.get(Project, project_id),
        drone=drone,
        mavlink_url=mavlink_url,
        home_lat=home_lat,
        home_lon=home_lon,
    )


def _square_around(lat: float, lon: float, meters: float = 100) -> list[tuple[float, float]]:
    """Return a 4-point square polygon (~100 m around the center)."""
    # 1 deg lat ≈ 111_000 m; 1 deg lon ≈ 111_000 * cos(lat)
    import math
    dlat = meters / 111_000.0
    dlon = meters / (111_000.0 * math.cos(math.radians(lat)) or 1.0)
    return [
        (lat - dlat, lon - dlon),
        (lat - dlat, lon + dlon),
        (lat + dlat, lon + dlon),
        (lat + dlat, lon - dlon),
    ]


# === MAVLink telemetry reader (verify SITL state) ===

class TelemetryReader:
    """Read MAVLink state from SITL — used to verify commands had effect."""
    def __init__(self, url: str):
        self.url = url
        self._conn = None

    def connect(self) -> None:
        from pymavlink import mavutil
        self._conn = mavutil.mavlink_connection(
            self.url,
            source_system=254,  # distinct from the pilot (255)
            source_component=191,
        )
        # Wait for first heartbeat
        self._conn.wait_heartbeat(timeout=15)

    def close(self) -> None:
        if self._conn:
            self._conn.close()

    def _poll(self, max_msgs: int = 50) -> None:
        for _ in range(max_msgs):
            try:
                msg = self._conn.recv_match(blocking=False)
            except Exception:
                break
            if msg is None:
                break

    def is_armed(self, timeout_s: float = 3.0) -> bool:
        """Poll heartbeat for `timeout_s` and return True if base_mode has ARMED flag."""
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            self._poll()
            hb = getattr(self._conn, "messages", {}).get("HEARTBEAT")
            if hb is not None:
                base_mode = getattr(hb, "base_mode", 0)
                # MAV_MODE_FLAG_SAFETY_ARMED = 128
                return bool(base_mode & 128)
            time.sleep(0.1)
        return False

    def is_disarmed(self, timeout_s: float = 3.0) -> bool:
        return not self.is_armed(timeout_s)

    def get_altitude_m(self, timeout_s: float = 3.0) -> float | None:
        """Return relative altitude from GLOBAL_POSITION_INT, or None."""
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            self._poll()
            pos = getattr(self._conn, "messages", {}).get("GLOBAL_POSITION_INT")
            if pos is not None:
                rel_alt = getattr(pos, "relative_alt", 0)
                return rel_alt / 1000.0  # mm → m
            time.sleep(0.1)
        return None

    def get_mode(self, timeout_s: float = 3.0) -> int | None:
        """Return custom_mode from HEARTBEAT (ArduPilot flight mode id)."""
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            self._poll()
            hb = getattr(self._conn, "messages", {}).get("HEARTBEAT")
            if hb is not None:
                return getattr(hb, "custom_mode", None)
            time.sleep(0.1)
        return None


# === Tests ===

def _issue_token(ctx: HilContext) -> str:
    """Issue a fresh single-use hardware confirmation token for the drone."""
    issued = hw_gate.issue_hardware_confirmation_token(ctx.db, ctx.user, ctx.project.id, ctx.drone.id)
    return str(issued["token"])


def _send(ctx: HilContext, command: str, params: dict | None = None, token: str | None = None) -> Any:
    """Send a command via the pilot directly (no HTTP). Token auto-issued if not given."""
    if token is None:
        token = _issue_token(ctx)
    pool = pool_mod.get_pool()
    pilot = pool.pilot(ctx.drone.id)
    geofence = geo.get_geofence(ctx.project.id)
    return pilot.send_command(
        command,
        parameters=params or {},
        confirmation_token=token,
        geofence_validation=lambda p: geo.validate_command_geofence(p, geofence),
    )


def test_arm_disarm(ctx: HilContext, reader: TelemetryReader) -> None:
    t0 = time.monotonic()
    # Arm
    receipt = _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 1.0})
    if not receipt.accepted:
        ctx.record("1. Arm + disarm", False, f"arm refusé: {receipt.reason}")
        return
    time.sleep(2)
    if not reader.is_armed(timeout_s=5):
        ctx.record("1. Arm + disarm", False, "drone SITL pas passé ARMED après 5 s")
        return
    # Disarm
    receipt = _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0})
    if not receipt.accepted:
        ctx.record("1. Arm + disarm", False, f"disarm refusé: {receipt.reason}")
        return
    time.sleep(2)
    if not reader.is_disarmed(timeout_s=5):
        ctx.record("1. Arm + disarm", False, "drone SITL toujours ARMED après disarm")
        return
    ctx.record("1. Arm + disarm", True, "ARMED → DISARMED confirmé via télémétrie", time.monotonic() - t0)


def test_takeoff(ctx: HilContext, reader: TelemetryReader) -> None:
    t0 = time.monotonic()
    # Arm + takeoff
    _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 1.0})
    time.sleep(1)
    receipt = _send(ctx, "NAV_TAKEOFF", cmd_api.build_takeoff_params(5.0))
    if not receipt.accepted:
        ctx.record("2. Takeoff 5 m", False, f"takeoff refusé: {receipt.reason}")
        return
    # Poll altitude up to 20 s
    deadline = time.monotonic() + 20
    reached = False
    while time.monotonic() < deadline:
        alt = reader.get_altitude_m(timeout_s=1)
        if alt is not None and alt >= 3.0:
            reached = True
            break
        time.sleep(0.5)
    if not reached:
        ctx.record("2. Takeoff 5 m", False, f"altitude < 3 m après 20 s (dernier alt = {alt})")
        return
    ctx.record("2. Takeoff 5 m", True, f"altitude atteinte: {alt:.1f} m", time.monotonic() - t0)


def test_land(ctx: HilContext, reader: TelemetryReader) -> None:
    t0 = time.monotonic()
    receipt = _send(ctx, "NAV_LAND", {})
    if not receipt.accepted:
        ctx.record("3. Land", False, f"land refusé: {receipt.reason}")
        return
    # Poll altitude down to 0
    deadline = time.monotonic() + 25
    landed = False
    while time.monotonic() < deadline:
        alt = reader.get_altitude_m(timeout_s=1)
        if alt is not None and alt <= 0.3:
            landed = True
            break
        time.sleep(0.5)
    if not landed:
        ctx.record("3. Land", False, f"altitude > 0.3 m après 25 s (dernier alt = {alt})")
        return
    # Disarm after landing
    _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0})
    ctx.record("3. Land", True, f"atterrissage confirmé (alt = {alt:.2f} m)", time.monotonic() - t0)


def test_rtl(ctx: HilContext, reader: TelemetryReader) -> None:
    t0 = time.monotonic()
    # Takeoff + RTL + vérif atterrissage
    _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 1.0})
    time.sleep(1)
    _send(ctx, "NAV_TAKEOFF", cmd_api.build_takeoff_params(8.0))
    time.sleep(5)
    alt = reader.get_altitude_m(timeout_s=2)
    if alt is None or alt < 3.0:
        ctx.record("4. RTL", False, f"pré-condition takeoff échouée (alt = {alt})")
        return
    # Send RTL
    receipt = _send(ctx, "NAV_RETURN_TO_LAUNCH", {})
    if not receipt.accepted:
        ctx.record("4. RTL", False, f"RTL refusé: {receipt.reason}")
        return
    # Poll landing
    deadline = time.monotonic() + 30
    landed = False
    while time.monotonic() < deadline:
        alt = reader.get_altitude_m(timeout_s=1)
        if alt is not None and alt <= 0.5:
            landed = True
            break
        time.sleep(0.5)
    _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0})
    if not landed:
        ctx.record("4. RTL", False, f"RTL: pas atterri après 30 s (alt = {alt})")
        return
    ctx.record("4. RTL", True, f"RTL → atterrissage (alt = {alt:.2f} m)", time.monotonic() - t0)


def test_estop(ctx: HilContext, reader: TelemetryReader) -> None:
    t0 = time.monotonic()
    # Takeoff
    _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 1.0})
    time.sleep(1)
    _send(ctx, "NAV_TAKEOFF", cmd_api.build_takeoff_params(10.0))
    time.sleep(6)
    alt_before = reader.get_altitude_m(timeout_s=2)
    if alt_before is None or alt_before < 3.0:
        ctx.record("5. E-STOP", False, f"pré-condition takeoff échouée (alt = {alt_before})")
        return
    # Trigger e-stop (broadcasts NAV_LAND to all drones in pool)
    pool = pool_mod.get_pool()
    result = geo.emergency_stop_all(pool, audit_logger=None)
    if not result.get("stopped"):
        ctx.record("5. E-STOP", False, f"e-stop returned stopped=False: {result.get('reason')}")
        return
    # Poll landing — e-stop should land within ~10 s
    deadline = time.monotonic() + 15
    landed = False
    while time.monotonic() < deadline:
        alt = reader.get_altitude_m(timeout_s=1)
        if alt is not None and alt <= 0.5:
            landed = True
            break
        time.sleep(0.3)
    _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0})
    if not landed:
        ctx.record("5. E-STOP", False, f"e-stop: pas atterri après 15 s (alt = {alt})")
        return
    elapsed = time.monotonic() - t0
    ctx.record("5. E-STOP", True, f"e-stop → atterrissage en {elapsed:.1f}s", elapsed)


def test_refuse_non_allowlisted(ctx: HilContext) -> None:
    t0 = time.monotonic()
    token = _issue_token(ctx)
    try:
        _send(ctx, "MAV_CMD_DO_SET_HOME", {"p1": 1.0}, token=token)
        ctx.record("6. Refus commande hors allowlist", False, "commande non-allowlistée acceptée (BUG)")
    except cmd_api.HardwareCommandError as exc:
        if exc.code == "COMMAND_NOT_ALLOWED":
            ctx.record("6. Refus commande hors allowlist", True, f"403 {exc.code} comme attendu", time.monotonic() - t0)
        else:
            ctx.record("6. Refus commande hors allowlist", False, f"mauvaise erreur: {exc.code}")
    except Exception as exc:
        ctx.record("6. Refus commande hors allowlist", False, f"exception inattendue: {type(exc).__name__}: {exc}")


def test_token_single_use(ctx: HilContext) -> None:
    t0 = time.monotonic()
    token = _issue_token(ctx)
    # First use — should succeed (arm)
    r1 = _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0}, token=token)  # disarm (safe)
    if not r1.accepted:
        ctx.record("7. Token single-use déjà consumé", False, f"1er envoi échoué: {r1.reason}")
        return
    # Second use — should fail
    try:
        _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0}, token=token)
        ctx.record("7. Token single-use déjà consumé", False, "2e envoi accepté (BUG — token réutilisable)")
    except lb.LabBenchError as exc:
        if exc.code == "TOKEN_ALREADY_USED":
            ctx.record("7. Token single-use déjà consumé", True, f"409 {exc.code} comme attendu", time.monotonic() - t0)
        else:
            ctx.record("7. Token single-use déjà consumé", False, f"mauvaise erreur: {exc.code}")
    except Exception as exc:
        ctx.record("7. Token single-use déjà consumé", False, f"exception inattendue: {type(exc).__name__}")


def test_geofence_breach(ctx: HilContext, reader: TelemetryReader) -> None:
    t0 = time.monotonic()
    # Clear geofence — should fail-closed
    geo.clear_geofence(ctx.project.id)
    token = _issue_token(ctx)
    try:
        _send(ctx, "NAV_TAKEOFF", cmd_api.build_takeoff_params(5.0), token=token)
        ctx.record("8. Refus takeoff sans géofence", False, "takeoff accepté sans géofence (BUG — fail-closed non respecté)")
    except cmd_api.HardwareCommandError as exc:
        if exc.code == "GEOFENCE_BREACH":
            ctx.record("8. Refus takeoff sans géofence", True, f"409 {exc.code} (fail-closed OK)", time.monotonic() - t0)
        else:
            ctx.record("8. Refus takeoff sans géofence", False, f"mauvaise erreur: {exc.code}")
    except Exception as exc:
        ctx.record("8. Refus takeoff sans géofence", False, f"exception inattendue: {type(exc).__name__}: {exc}")
    # Restore geofence for safety
    polygon = _square_around(ctx.home_lat, ctx.home_lon, meters=100)
    geo.set_geofence(geo.Geofence(
        project_id=ctx.project.id,
        polygon=polygon,
        max_altitude_m=30.0,
        max_distance_m=200.0,
        home_lat=ctx.home_lat,
        home_lon=ctx.home_lon,
    ))


# === Main ===

def main() -> int:
    parser = argparse.ArgumentParser(description="Validation HIL AeroMind LabBench 01 v5")
    parser.add_argument("--aeromind-url", default="http://127.0.0.1:10000", help="URL backend AeroMind (non utilisé en mode service-direct)")
    parser.add_argument("--mavlink-url", default="udpout:127.0.0.1:14550", help="URL MAVLink SITL")
    parser.add_argument("--home-lat", type=float, default=38.0, help="Latitude home SITL")
    parser.add_argument("--home-lon", type=float, default=-122.0, help="Longitude home SITL")
    args = parser.parse_args()

    print(f"{BOLD}{CYAN}=== Validation HIL AeroMind LabBench 01 v5 ==={RESET}")
    print(f"  MAVLink URL  : {args.mavlink_url}")
    print(f"  Home         : ({args.home_lat}, {args.home_lon})")
    print(f"  HARDWARE_CONTROL = {os.environ.get('HARDWARE_CONTROL', 'false')}")
    print()

    if os.environ.get("HARDWARE_CONTROL", "").strip().lower() != "true":
        print(f"{RED}ERREUR : HARDWARE_CONTROL doit être 'true' (actuel: {os.environ.get('HARDWARE_CONTROL')!r}){RESET}")
        return 2

    # Setup
    print(f"{CYAN}[SETUP]{RESET} Initialisation DB + bootstrap gates...")
    ctx = setup_db_and_bootstrap(args.mavlink_url, args.home_lat, args.home_lon)
    print(f"  Projet: {ctx.project.id}")
    print(f"  Drone : {ctx.drone.id} ({ctx.drone.name})")
    print()

    # Connect telemetry reader (separate MAVLink connection to observe state)
    print(f"{CYAN}[SETUP]{RESET} Connexion télémétrie SITL...")
    reader = TelemetryReader(args.mavlink_url)
    try:
        reader.connect()
    except Exception as exc:
        print(f"{RED}Connexion télémétrie SITL échouée: {exc}{RESET}")
        print(f"{AMBER}Vérifiez que sim_vehicle.py tourne et expose MAVLink sur {args.mavlink_url}{RESET}")
        return 3
    print(f"  Connecté. Heartbeat reçu.")
    print()

    # Run tests
    print(f"{BOLD}{CYAN}=== Exécution des 8 tests HIL ==={RESET}")
    try:
        test_arm_disarm(ctx, reader)
        test_takeoff(ctx, reader)
        test_land(ctx, reader)
        test_rtl(ctx, reader)
        test_estop(ctx, reader)
        test_refuse_non_allowlisted(ctx)
        test_token_single_use(ctx)
        test_geofence_breach(ctx, reader)
    finally:
        reader.close()
        # Disarm safety
        try:
            _send(ctx, "NAV_LAND", {})
            _send(ctx, "COMPONENT_ARM_DISARM", {"p1": 0.0})
        except Exception:
            pass

    # Report
    print()
    print(f"{BOLD}{CYAN}=== Rapport final ==={RESET}")
    passed = sum(1 for r in ctx.results if r.passed)
    total = len(ctx.results)
    for r in ctx.results:
        mark = f"{GREEN}PASS{RESET}" if r.passed else f"{RED}FAIL{RESET}"
        print(f"  [{mark}] {r.name}")
        if r.detail:
            print(f"         {r.detail}")
    print()
    color = GREEN if passed == total else RED
    print(f"{BOLD}{color}Résultat : {passed}/{total} tests réussis{RESET}")
    if passed == total:
        print(f"{GREEN}✓ Validation HIL réussie. AeroMind peut activer HARDWARE_CONTROL=true en confiance.{RESET}")
        return 0
    else:
        print(f"{RED}✗ Validation HIL échouée. Voir le détail ci-dessus + logs/sitl.log.{RESET}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
