"""Defensive host/application probes for AeroMind.

This module is intentionally fail-closed: an unavailable host antivirus is
reported as uncovered, never as protected. It does not inspect credentials,
connect to aircraft, or mutate the organizational controls.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
from datetime import UTC, datetime
from pathlib import Path

BASELINE_PATH = Path("data/aeromind-security-baseline.json")
SKIP_DIRS = {".git", "node_modules", "dist", "__pycache__", ".venv", "venv"}
SUSPICIOUS_EXTENSIONS = {".exe", ".dll", ".scr", ".ps1", ".bat", ".cmd", ".vbs", ".jar"}
SUSPICIOUS_PATTERNS = [
    re.compile(r"(?:powershell|cmd(?:\.exe)?)\s+[^\n]{0,180}(?:-enc|base64|/c)", re.I),
    re.compile(r"(?:eval|exec)\s*\(\s*(?:atob|base64|decode)", re.I),
    re.compile(r"(?:child_process|subprocess)\s*\.(?:exec|spawn|Popen)\s*\(", re.I),
]

def _utc() -> str:
    return datetime.now(UTC).isoformat()

def _files(root: Path) -> list[Path]:
    result: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.stat().st_size > 2_000_000:
            continue
        result.append(path)
    return result

def _integrity_scan(root: Path) -> dict:
    entries: dict[str, str] = {}
    suspicious: list[dict[str, str]] = []
    for path in _files(root):
        relative = str(path.relative_to(root))
        if relative == str(BASELINE_PATH):
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        entries[relative] = digest
        if path.suffix.lower() in SUSPICIOUS_EXTENSIONS:
            suspicious.append({"path": relative, "reason": "extension_executable_or_script"})
        if relative != "web/security_monitor.py" and path.suffix.lower() in {".py", ".js", ".ts", ".tsx", ".sh", ".html"}:
            try:
                text = path.read_text(errors="ignore")
            except OSError:
                text = ""
            for pattern in SUSPICIOUS_PATTERNS:
                if pattern.search(text):
                    suspicious.append({"path": relative, "reason": "suspicious_execution_pattern"})
                    break
    baseline = {}
    baseline_state = "unavailable"
    try:
        if BASELINE_PATH.exists():
            baseline = json.loads(BASELINE_PATH.read_text()).get("files", {})
            baseline_state = "verified" if baseline == entries else "changed"
        else:
            BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
            BASELINE_PATH.write_text(json.dumps({"createdAt": _utc(), "files": entries}, indent=2, sort_keys=True))
            baseline_state = "created"
    except (OSError, json.JSONDecodeError):
        baseline_state = "unavailable"
    return {"status": "blocked" if suspicious else ("watch" if baseline_state in {"changed", "unavailable"} else "ok"), "baseline": baseline_state, "filesScanned": len(entries), "suspicious": suspicious[:25]}

def _host_antivirus(root: Path) -> dict:
    binary = shutil.which("clamscan")
    if not binary:
        return {"status": "uncovered", "engine": None, "detail": "ClamAV/clamscan absent: aucune couverture antivirus hôte confirmée."}
    try:
        result = subprocess.run([binary, "--no-summary", "--infected", "--recursive", "--exclude-dir=\\.git", str(root)], capture_output=True, text=True, timeout=45, check=False)
        if result.returncode == 0:
            return {"status": "ok", "engine": "ClamAV", "detail": "Scan hôte terminé, aucune signature détectée."}
        if result.returncode == 1:
            return {"status": "blocked", "engine": "ClamAV", "detail": "ClamAV a détecté une menace.", "findings": result.stdout.splitlines()[:25]}
        return {"status": "uncovered", "engine": "ClamAV", "detail": f"Scan non concluant (code {result.returncode}); base de signatures ou droits à vérifier."}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"status": "uncovered", "engine": "ClamAV", "detail": f"Scan hôte indisponible: {type(exc).__name__}."}

def _process_probe() -> dict:
    processes = 0
    suspicious: list[dict[str, str]] = []
    proc = Path("/proc")
    if proc.exists():
        for entry in proc.iterdir():
            if not entry.name.isdigit():
                continue
            processes += 1
            try:
                cmdline = (entry / "cmdline").read_bytes().decode(errors="ignore").replace("\x00", " ")
                if any(token in cmdline.lower() for token in ("nc -e", "socat", "miner", "cryptominer")):
                    suspicious.append({"pid": entry.name, "command": cmdline[:180]})
            except OSError:
                continue
    return {"status": "blocked" if suspicious else "ok", "processesObserved": processes, "suspicious": suspicious[:20]}

def _network_probe() -> dict:
    listeners = 0
    try:
        for proc_file in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
            if proc_file.exists():
                lines = proc_file.read_text().splitlines()[1:]
                listeners += sum(1 for line in lines if len(line.split()) > 3 and line.split()[3] == "0A")
    except OSError:
        return {"status": "watch", "listeners": None, "detail": "Table réseau locale indisponible."}
    return {"status": "ok", "listeners": listeners, "detail": "Écoute locale observée; aucune connexion sortante n’est initiée par la sonde."}

def run_security_probe(root: Path | None = None) -> dict:
    project_root = (root or Path.cwd()).resolve()
    integrity = _integrity_scan(project_root)
    antivirus = _host_antivirus(project_root)
    processes = _process_probe()
    network = _network_probe()
    alerts: list[dict[str, str]] = []
    if antivirus["status"] == "uncovered":
        alerts.append({"severity": "BLOCKED", "code": "HOST_AV_UNAVAILABLE", "message": antivirus["detail"]})
    if integrity["status"] == "blocked":
        alerts.append({"severity": "BLOCKED", "code": "INTEGRITY_SUSPICIOUS", "message": "Motif ou artefact suspect détecté dans le périmètre analysé."})
    elif integrity["status"] == "watch":
        alerts.append({"severity": "WATCH", "code": "INTEGRITY_BASELINE_CHANGED", "message": "L’empreinte de référence a changé ou n’est pas disponible."})
    if processes["status"] == "blocked":
        alerts.append({"severity": "BLOCKED", "code": "PROCESS_ANOMALY", "message": "Processus local atypique détecté."})
    return {"timestamp": _utc(), "host": socket.gethostname(), "simulationOnly": True, "hardwareControl": False, "integrity": integrity, "antivirus": antivirus, "processes": processes, "network": network, "alerts": alerts}
