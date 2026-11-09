"""Fail-closed capability policy for engineering and simulation HTTP APIs.

L1: read, drafts, basic virtual calculations.
L2: engineering edits and nominal virtual simulations.
L3: advanced analysis, workflow, evidence and export.
L4/L5 accounts pass this tier check, but all route-local role, owner,
step-up, CSRF and physical safety controls still apply. Physical endpoints
are never granted by an L1-L3 tier.
"""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import unquote

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .app_auth_helpers import current_user


_LEVELS = {"L1": 1, "L2": 2, "L3": 3, "L4": 4, "L5": 5}


@dataclass(frozen=True)
class Capability:
    minimum: int
    name: str
    public: bool = False
    physical_boundary: bool = False
    method_not_allowed: bool = False


def _cap(level: int, name: str, *, public: bool = False,
         physical: bool = False, method_not_allowed: bool = False) -> Capability:
    return Capability(level, name, public, physical, method_not_allowed)


def _prefix(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def capability_for(path: str, method: str) -> Capability | None:
    """Return the server-side requirement for a request, or None if unrelated."""
    path = unquote(path.split("?", 1)[0])
    method = method.upper()

    # Authentication handshakes, the independent administrator-console
    # session, anonymous opaque-key workspaces, and public liveness metadata
    # have their own explicit protections/contracts and are not tier routes.
    if (any(_prefix(path, prefix) for prefix in (
        "/api/auth", "/api/identity", "/api/admin-console", "/api/local/workspace",
    )) or path in {
        "/api/health", "/api/ready", "/api/capabilities",
        "/api/platform/config.js", "/api/oidc/login",
    }):
        return None

    # The legacy tRPC bridge is a single catch-all endpoint. Explicitly classify
    # every engineering/simulation procedure; unknown procedures in these
    # namespaces fail closed for L1-L3.
    if _prefix(path, "/api/trpc"):
        proc = path[len("/api/trpc/"):].rstrip("/").replace("/", ".") if path != "/api/trpc" else ""
        read_only = {
            "projects.list", "simulationRuns.list", "reports.list",
            "auditEvents.list", "labBench.status", "labBench.registry",
            "labBench.gateState", "labBench.fleetGateState",
            "labBench.perDroneGateState", "ai.status", "auth.me",
            "identity.providers", "superAdmin.accounts", "superAdmin.activity",
        }
        levels = {
            "projects.list": 1, "projects.create": 1,
            "projects.saveSnapshot": 2, "projects.delete": 2,
            "simulationRuns.list": 1, "simulationRuns.create": 2,
            "reports.list": 1, "reports.create": 2, "reports.submit": 2,
            "reports.review": 3, "reports.approve": 4,
            "auditEvents.list": 1, "auditEvents.record": 2,
            "labBench.status": 1, "labBench.registry": 1,
            "labBench.gateState": 1, "labBench.fleetGateState": 1,
            "labBench.perDroneGateState": 1, "labBench.runSimulation": 1,
            "labBench.validateCommand": 1, "labBench.seedRegistry": 3,
            "labBench.persistSimulation": 2, "labBench.createReport": 2,
            "ai.chat": 1,
            "auth.me": 1, "identity.providers": 1,
            "superAdmin.accounts": 4, "superAdmin.activity": 4,
        }
        if proc in levels:
            level = levels[proc]
            if method in {"GET", "HEAD"} and proc not in read_only:
                return _cap(5, "trpc_mutation_requires_post", method_not_allowed=True)
            return _cap(level, f"trpc:{proc}", public=proc in {"labBench.status", "ai.status"})
        if proc.startswith(("projects.", "simulationRuns.", "reports.", "auditEvents.", "labBench.", "ai.")):
            return _cap(4, "unclassified_trpc_procedure")
        if proc.startswith("superAdmin."):
            if method in {"GET", "HEAD"} and proc not in read_only:
                return _cap(5, "trpc_admin_mutation_requires_post", method_not_allowed=True)
            return _cap(4, "superadmin_console_procedure")
        if proc.startswith(("auth.", "identity.")):
            if method in {"GET", "HEAD"} and proc not in read_only:
                return _cap(5, "trpc_auth_mutation_requires_post", method_not_allowed=True)
            return _cap(1, "authentication_metadata", public=proc in read_only)
        # Unknown procedures are not allowed to silently escape the matrix.
        if proc:
            if method in {"GET", "HEAD"} and proc not in read_only:
                return _cap(5, "unknown_trpc_get_requires_post", method_not_allowed=True)
            return _cap(4, "unclassified_trpc_procedure")
        return None

    # Hardware control, live telemetry, flight-data export, mission upload and
    # execution of physical voice commands are outside L1-L3, regardless of
    # whether the current runtime is configured virtual-only. Higher-tier
    # users still face the route's independent interlocks and approvals.
    if (_prefix(path, "/api/hardware") or _prefix(path, "/api/flights")
            or _prefix(path, "/api/telemetry/mavlink")
            or path == "/api/voice/execute"
            or (path.startswith("/api/missions/") and path.endswith("/upload"))):
        return _cap(4, "physical_or_live_data_boundary", physical=True)

    if path == "/api/ops/mode" and method not in {"GET", "HEAD"}:
        return _cap(5, "operating_mode_change")
    if path == "/api/ops/cfd/prepare":
        return _cap(3, "advanced_cfd_analysis")

    # Project-owned workspace and CRUD routes.
    if path == "/api/projects":
        return _cap(1 if method in {"GET", "HEAD", "POST"} else 4, "project_draft_or_read")
    if _prefix(path, "/api/projects"):
        parts = path.strip("/").split("/")
        if len(parts) >= 4 and parts[3] == "drones":
            if len(parts) == 4:
                return _cap(1 if method in {"GET", "HEAD"} else 2, "drone_catalog_or_edit")
            return _cap(1 if method in {"GET", "HEAD"} else 2, "drone_read_or_edit")
        if len(parts) >= 4 and parts[3] in {"simulations", "reports"}:
            return _cap(1 if method in {"GET", "HEAD"} else 2, "project_simulation_or_report")
        if len(parts) >= 4 and parts[3] == "lab-sessions":
            return _cap(1 if method in {"GET", "HEAD"} else 2, "project_lab_session")
        return _cap(1 if method in {"GET", "HEAD"} else 2, "project_read_or_edit")

    if _prefix(path, "/api/engineering"):
        if path.endswith(("/status", "/connectors")) and method in {"GET", "HEAD"}:
            return _cap(1, "engineering_status_or_catalog")
        if path.endswith(("/cfd/airfoil", "/propulsion/compare")):
            return _cap(1, "basic_virtual_analysis")
        if path.endswith("/evidence/certificate") or path.endswith("/simulations/external-sitl"):
            return _cap(3, "advanced_engineering_workflow")
        if path.endswith("/simulations/internal"):
            return _cap(2, "nominal_simulation")
        if path.endswith("/files/import-jobs") or path.endswith("/files/export-jobs"):
            return _cap(3, "advanced_import_or_export")
        if "/jobs/" in path or "/artifacts/" in path:
            if path.endswith("/cancel"):
                return _cap(2, "engineering_job_cancel")
            if path.endswith("/commit"):
                return _cap(3, "engineering_artifact_commit")
            return _cap(3, "advanced_engineering_artifact")
        return _cap(4, "unclassified_engineering_route")

    if _prefix(path, "/api/engineering-documents"):
        return _cap(1 if method in {"GET", "HEAD"} else 2, "engineering_document")
    if _prefix(path, "/api/workflow"):
        if "/runs/" in path or path.endswith("/runs"):
            if method in {"GET", "HEAD"}:
                return _cap(1, "workflow_run_read")
            return _cap(3, "advanced_workflow_run")
        return _cap(1 if method in {"GET", "HEAD"} else 2, "prototype_draft_or_edit")
    if _prefix(path, "/api/materials"):
        if path in {"/api/materials/categories", "/api/materials/catalog"} and method in {"GET", "HEAD"}:
            return _cap(1, "public_material_catalog", public=True)
        return _cap(1 if method in {"GET", "HEAD"} else 2, "material_catalog_edit")
    if _prefix(path, "/api/lab"):
        if path.endswith("/measurements") or path.endswith("/events"):
            return _cap(3, "advanced_lab_analysis")
        if "/gates/" in path and method not in {"GET", "HEAD"}:
            return _cap(3, "lab_gate_workflow")
        if path.endswith("/runs"):
            return _cap(2, "nominal_lab_simulation")
        if method in {"GET", "HEAD"}:
            return _cap(1, "lab_read_or_status")
        return _cap(2, "lab_engineering_edit")
    if _prefix(path, "/api/labbench"):
        if path.endswith("/run-simulation") or any(x in path for x in ("/arm-n3", "/sign-off-n4", "/hardware-checklist")):
            return _cap(3, "labbench_advanced_workflow")
        return _cap(1 if method in {"GET", "HEAD"} else 2, "labbench_read_or_edit")
    if _prefix(path, "/api/preflight"):
        if path == "/api/preflight/default-template" and method in {"GET", "HEAD"}:
            return _cap(1, "public_preflight_template", public=True)
        if path.endswith("/execute"):
            return _cap(3, "preflight_analysis_record")
        return _cap(1 if method in {"GET", "HEAD"} else 2, "preflight_checklist")
    if _prefix(path, "/api/missions"):
        return _cap(1 if method in {"GET", "HEAD"} else 2, "mission_plan")
    if _prefix(path, "/api/maintenance"):
        return _cap(1 if method in {"GET", "HEAD"} else 2, "maintenance_record")
    if _prefix(path, "/api/dashboard"):
        return _cap(1, "workspace_dashboard")
    if _prefix(path, "/api/operational-state"):
        return _cap(1 if method in {"GET", "HEAD"} else 2, "virtual_operational_state")
    if _prefix(path, "/api/command-center"):
        if path.endswith("/approve-second") or path.endswith("/reject-second"):
            return _cap(3, "independent_review")
        if path.endswith("/execute-simulation"):
            return _cap(2, "nominal_virtual_execution")
        if method in {"GET", "HEAD"}:
            return _cap(1, "command_center_read")
        return _cap(2, "command_center_workflow")
    if _prefix(path, "/api/control"):
        return _cap(1, "virtual_control_only")
    if _prefix(path, "/api/institutional"):
        if path.endswith("/simulate"):
            return _cap(2, "institutional_virtual_simulation")
        if "/gates/" in path or path.endswith("/gate-05") or path.endswith("/verify"):
            return _cap(3, "institutional_advanced_gate")
        return _cap(1 if method in {"GET", "HEAD"} else 2, "institutional_workflow")
    if _prefix(path, "/api/voice"):
        if path == "/api/voice/examples" and method in {"GET", "HEAD"}:
            return _cap(1, "public_voice_examples", public=True)
        if path.endswith("/parse"):
            return _cap(1, "virtual_command_parse")
        return _cap(4, "unclassified_voice_route")
    if _prefix(path, "/api/sitl"):
        if path.endswith("/status") and method in {"GET", "HEAD"}:
            return _cap(1, "sitl_status")
        if any(path.endswith(x) for x in ("/propulsion/step", "/geofence/check")):
            return _cap(3, "advanced_sitl_simulation")
        return _cap(4, "unclassified_sitl_route")
    if _prefix(path, "/api/telemetry") or _prefix(path, "/api/flights"):
        return _cap(4, "unclassified_live_telemetry", physical=True)
    if _prefix(path, "/api/ops"):
        if path.endswith(("/health", "/capabilities", "/mode")) and method in {"GET", "HEAD"}:
            return _cap(1, "operations_status")
        return _cap(4, "unclassified_operations_route")

    if path == "/api/system/status" or path == "/api/safety/check":
        return _cap(1, "system_or_safety_read")

    # Catch unreviewed routes under known domain prefixes. L4/L5 can continue
    # to their existing route-local controls; L1-L3 cannot silently inherit.
    for prefix in ("/api/simulations", "/api/reports", "/api/audit-events"):
        if _prefix(path, prefix):
            return _cap(1 if method in {"GET", "HEAD"} else 2, "simulation_or_report_resource")
    if path.startswith("/api/"):
        return _cap(4, "unclassified_api_route")
    return None


class CapabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method.upper() == "OPTIONS":
            return await call_next(request)
        policy = capability_for(request.url.path, request.method)
        if policy is None:
            return await call_next(request)

        if policy.method_not_allowed:
            return JSONResponse(
                status_code=405,
                content={"error": {"code": "METHOD_NOT_ALLOWED", "message": "Cette mutation doit utiliser POST."}},
                headers={"Allow": "POST", "Cache-Control": "no-store"},
            )

        actor = current_user(
            request.cookies.get("aeromind_session"),
            request.headers.get("authorization"),
        )
        if actor is None:
            if policy.public:
                return await call_next(request)
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "AUTHENTICATION_REQUIRED", "message": "Une session AeroMind est requise pour cette fonction."}},
                headers={"Cache-Control": "no-store"},
            )

        role = str(actor.get("role", "user"))
        level = "L5" if role == "super_admin" else "L4" if role == "admin" else str(actor.get("level", "L1"))
        rank = _LEVELS.get(level, 1)
        if rank < policy.minimum:
            return JSONResponse(
                status_code=403,
                content={"error": {
                    "code": "CAPABILITY_REQUIRED",
                    "message": f"Le niveau {policy.name} est requis (minimum L{policy.minimum}).",
                    "details": {"requiredLevel": f"L{policy.minimum}", "currentLevel": level},
                }},
                headers={"Cache-Control": "no-store"},
            )
        return await call_next(request)
