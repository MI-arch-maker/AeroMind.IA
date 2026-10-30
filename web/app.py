import base64
import json
import json as _json
import os
import shutil
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import Cookie, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .copilot import router as copilot_router
from .engineering_extensions import router as engineering_extensions_router
from .workflow import router as workflow_router
from .command_center import router as command_center_router
from .engineering_document import router as engineering_document_router
from .admin import activity as admin_activity, clear_audit_logs, create_account, delete_account, delete_superadmin_account, issue_daily_totp_code, list_accounts, migrate_legacy_registry, reset_local_auth, reset_superadmin_local_auth, rotate_authorization_code, rotate_superadmin_authorization_code, update_account, update_project_control, update_superadmin_account, verify_authorization_code
from .app_auth_helpers import current_user as resolve_current_user
from .oidc import _is_microsoft_entra_issuer, _session_token, _verified, router as oidc_router
from .local_auth import router as local_auth_router
from .registration_api import router as registration_router
from .ops_control_api import router as ops_control_router
from .business_api import router as business_router
from .hardware_api import router as hardware_router
from .operational_state import router as operational_state_router
from . import labbench as labbench_service
from . import hardware_gate as hardware_gate_service
from .labbench_auth import (
    verify_lab_session as _verify_lab_session,
    StepUpSession as _StepUpSession,
    SESSION_COOKIE_NAME as _LAB_SESSION_COOKIE,
    SESSION_HEADER_NAME as _LAB_SESSION_HEADER,
)
from . import mavlink_command_api as mavlink_command_service
from . import mavlink_pool as mavlink_pool_service
from . import geofence_validator as geofence_service
from .fleet_telemetry import router as fleet_telemetry_router
from .material_library import router as material_library_router
from .mission_planner import router as mission_planner_router
from .preflight import router as preflight_router
from .maintenance import router as maintenance_router
from .dashboard import router as dashboard_router
from .voice_commands import router as voice_commands_router
from .realtime import router as realtime_router
# P0-03 fix — EXIGENCE CANON-01: the canonical LABBENCH router
# (/api/lab/*) MUST be registered on app boot so the canonical contract
# endpoints (step-up sessions, drone revisions, test runs, measurements,
# gate approvals, mode info) are exposed under OpenAPI and callable via
# authenticated HTTP. Previously the module existed but was never imported,
# so every /api/lab/* request 404'd.
from .labbench_canonical_api import router as labbench_canonical_router
from .database import Base, engine, ping_database, SessionLocal
from .models import User, Project, Drone, Simulation, Report, AuditEvent, LabSession
# P0-07 audit_events_ext — ensure AuditEventExt is registered on Base.metadata
# BEFORE lifespan runs Base.metadata.create_all(), so the table is auto-created
# in dev (SQLite) without needing to apply the canonical migration manually.
# Without this import the AuditEventExt class is only loaded lazily inside
# admin.py / labbench_auth.py / ops_control_api.py, and create_all() skips the
# table entirely, which makes every auditEventsExt.* procedure fail with
# "no such table: audit_events_ext" in the dev profile.
from . import canonical_models  # noqa: F401 — registers AuditEventExt on Base.metadata
from sqlalchemy import select
from uuid import UUID, uuid4
from sitl_modules.api import router as sitl_router
from .mavlink_telemetry_api import router as mavlink_telemetry_router
from .i18n import locale_from_accept_language, localized_message


def _engine_status():
    try:
        from main import AeroMindAI
        engine = AeroMindAI()
        return {'loaded': True, 'profiles': len(engine.compatibility_engine._known_profiles), 'safety': engine.run_safety_check()}
    except Exception as exc:
        return {'loaded': False, 'error': type(exc).__name__}


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    # P1-obs fix (INSPECT-DEVOPS F-7.3): structured logging + Sentry init
    import logging as _logging
    import os as _os
    _log_level = _os.getenv("LOG_LEVEL", "INFO").upper()
    _logging.basicConfig(
        level=getattr(_logging, _log_level, _logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    log = _logging.getLogger("aeromind.app")
    log.info("AeroMind starting up environment=%s hardware_control=%s",
             settings.environment, _os.getenv("HARDWARE_CONTROL", "false"))
    # Sentry (optional)
    _sentry_dsn = _os.getenv("SENTRY_DSN")
    if _sentry_dsn:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            sentry_sdk.init(
                dsn=_sentry_dsn,
                environment=settings.environment,
                traces_sample_rate=0.1,
                integrations=[FastApiIntegration()],
            )
            log.info("Sentry initialized for environment=%s", settings.environment)
        except ImportError:
            log.warning("SENTRY_DSN set but sentry-sdk not installed; skipping Sentry init")
    Path('data').mkdir(exist_ok=True)
    Path('logs').mkdir(exist_ok=True)
    # The production deployment can run migrations independently, while the
    # single-container/local profile must still be bootable from a clean DB.
    # create_all is idempotent and only creates the declared tables; it does
    # not replace a migration system for destructive schema changes.
    # TiDB Cloud production users are often intentionally denied DDL rights.
    # Do not make the whole web process unavailable because an optional
    # bootstrap operation cannot CREATE tables. Set
    # AEROMIND_AUTO_CREATE_SCHEMA=true only for a database user allowed to run
    # the bootstrap; production defaults to false and expects a pre-created
    # schema/migration.
    auto_create_schema = os.getenv(
        'AEROMIND_AUTO_CREATE_SCHEMA',
        'false' if settings.environment == 'production' else 'true',
    ).strip().lower() in {'1', 'true', 'yes', 'on'}
    if auto_create_schema:
        try:
            Base.metadata.create_all(bind=engine)
        except SQLAlchemyError as exc:
            print(
                'WARNING: database schema bootstrap skipped; the configured '
                f'database user cannot create tables ({type(exc).__name__}). '
                'Pre-create the schema with an administrator or grant DDL '
                'privileges before using persistent API routes.',
                flush=True,
            )
    else:
        print(
            'Database schema bootstrap disabled; expecting a pre-created '
            'schema (AEROMIND_AUTO_CREATE_SCHEMA=false).',
            flush=True,
        )
    try:
        migrated = migrate_legacy_registry()
        if migrated['accounts'] or migrated['events']:
            print(f"Imported legacy admin registry into the main database: {migrated}", flush=True)
    except SQLAlchemyError as exc:
        print(f"WARNING: legacy account registry import deferred ({type(exc).__name__}); apply the admin account schema before retrying.", flush=True)
    if settings.environment == 'development':
        try:
            from .admin import reconcile_primary_identity
            reconcile_primary_identity()
        except SQLAlchemyError as exc:
            print(f"WARNING: primary identity reconciliation deferred ({type(exc).__name__}).", flush=True)
    # ─── MAVLink SITL autopilot emitter (development only) ───────────────
    # When AEROMIND_ENV=development and pymavlink is installed, start a
    # lightweight MAVLink SITL emitter that broadcasts REAL MAVLink frames
    # (HEARTBEAT, GLOBAL_POSITION_INT, SYS_STATUS, GPS_RAW_INT, VFR_HUD,
    # FENCE_STATUS) on UDP 14551. The MavlinkObserver connects to it with
    # pymavlink exactly as it would to a physical Pixhawk, so the Navigation
    # satellite telemetry panel is 100 % functional in dev without any
    # autopilot binary (ArduPilot/PX4) install. Disabled in production where
    # a real vehicle or a real SITL binary is expected.
    _sitl_emitter = None
    if settings.environment == 'development' and os.getenv('AEROMIND_SITL_AUTOSTART', 'true').strip().lower() in {'1', 'true', 'yes', 'on'}:
        try:
            import sys as _sys
            _root = str(Path(__file__).resolve().parent.parent)
            if _root not in _sys.path:
                _sys.path.insert(0, _root)
            from scripts.sitl.mavlink_sitl_emitter import MavlinkSitlEmitter  # type: ignore
            _sitl_host = os.getenv('AEROMIND_MAVLINK_OBSERVER_HOST', '127.0.0.1')
            # The observer connects with udpin:host:port — the emitter must
            # send TO that same host:port. Parse the configured observer URL
            # to derive the destination.
            _obs_url = os.getenv('AEROMIND_MAVLINK_OBSERVER_URL', 'udpin:127.0.0.1:14551')
            _sitl_port = 14551
            if ':' in _obs_url:
                try:
                    _sitl_port = int(_obs_url.rsplit(':', 1)[1])
                except ValueError:
                    pass
            _sitl_emitter = MavlinkSitlEmitter(host=_sitl_host, port=_sitl_port)
            _sitl_emitter.start()
            print(
                f"[lifespan] MAVLink SITL emitter started → udp://{_sitl_host}:{_sitl_port} "
                f"(real MAVLink frames; observer connects with {_obs_url})",
                flush=True,
            )
        except ImportError as exc:
            print(f"[lifespan] SITL emitter skipped (pymavlink or scripts path unavailable: {exc}).", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[lifespan] SITL emitter startup failed: {type(exc).__name__}: {exc}", flush=True)
    yield
    # ─── Shutdown: stop the SITL emitter cleanly ─────────────────────────
    if _sitl_emitter is not None:
        try:
            _sitl_emitter.stop()
            print("[lifespan] MAVLink SITL emitter stopped.", flush=True)
        except Exception:  # noqa: BLE001
            pass


settings = get_settings()
app = FastAPI(title='AeroMind AI API', version='2.0.0', docs_url='/docs' if settings.environment != 'production' else None, redoc_url=None, lifespan=lifespan)
# P1-obs fix (INSPECT-DEVOPS F-9.5): rate limiting on auth endpoints
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from slowapi import _rate_limit_exceeded_handler
    _limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = _limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    _HAS_SLOWAPI = True
except ImportError:
    _HAS_SLOWAPI = False
# P0-05 — anonymous workspace drafts are keyed by client-supplied opaque
# identifier (validated for shape) so two anonymous browsers cannot read
# or overwrite each other's drafts. The store is bounded; older entries
# are evicted FIFO when the cap is reached. Authenticated clients should
# persist via the canonical /api/lab/* API instead.
MAX_ANONYMOUS_WORKSPACES = 256
_local_workspaces: dict[str, dict] = {}
_WORKSPACE_KEY_RE = __import__('re').compile(r'^[A-Za-z0-9_-]{32,128}$')


def _is_valid_workspace_key(key: str) -> bool:
    """Validate the X-AeroMind-Workspace header value.

    Accepts 32..128 chars of [A-Za-z0-9_-] — opaque to the server, no
    internal structure assumed. A UUIDv4 (with or without dashes) or a
    base64url-encoded 16-byte token are both fine. The strict format
    prevents path traversal, header injection and trivial collisions.
    """
    return bool(_WORKSPACE_KEY_RE.match(key))
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.hosts)
if settings.origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'X-Request-ID', 'X-AeroMind-Workspace'])

FRONTEND_DIR = Path('frontend/dist')
FRONTEND_INDEX = FRONTEND_DIR / 'index.html'
if FRONTEND_DIR.is_dir():
    app.mount('/assets', StaticFiles(directory=FRONTEND_DIR / 'assets'), name='frontend-assets')

app.include_router(business_router)
app.include_router(hardware_router)
app.include_router(operational_state_router)
app.include_router(oidc_router)
app.include_router(local_auth_router)
# Phase 1 modernization: self-registration with super-admin approval
app.include_router(registration_router)
# Phase 3 activation: operational control endpoints
app.include_router(ops_control_router)
app.include_router(copilot_router)
app.include_router(engineering_extensions_router)
app.include_router(workflow_router)
app.include_router(command_center_router)
app.include_router(engineering_document_router)
app.include_router(sitl_router)
app.include_router(mavlink_telemetry_router)
app.include_router(fleet_telemetry_router)
app.include_router(material_library_router)
app.include_router(mission_planner_router)
app.include_router(preflight_router)
app.include_router(maintenance_router)
app.include_router(dashboard_router)
app.include_router(voice_commands_router)
app.include_router(realtime_router)
# P0-03 fix — register the canonical /api/lab/* router (EXIGENCE CANON-01).
app.include_router(labbench_canonical_router)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    # P0-04 fix (INSPECT-BACKEND B-CRIT-03): enforce CSRF on state-changing
    # methods when the lab_csrf cookie is present (i.e. user has step-up
    # session). If cookie is absent we don't block — the endpoint's own
    # auth check will return 401 if needed. This middleware specifically
    # prevents CSRF attacks where an attacker has the victim's aeromind_session
    # cookie but cannot read the CSRF token from sessionStorage/httpOnly.
    if request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        # Skip CSRF for OIDC callback (state nonce already verified) and
        # local login (no CSRF cookie set yet).
        _path = request.url.path
        _skip_paths = {
            "/api/auth/oidc/callback",
            "/api/auth/oidc/login",
            "/api/auth/local/login",
            "/api/auth/local/enroll",
            "/api/auth/dev-login",
            "/api/local/workspace",  # workspace uses X-AeroMind-Workspace header instead
            "/api/trpc",  # tRPC bridge has its own auth checks
        }
        if not any(_path.startswith(p) for p in _skip_paths):
            cookie_token = request.cookies.get("lab_csrf_token") or request.cookies.get("aeromind_lab_csrf")
            if cookie_token:
                # Step-up session present → require matching X-CSRF-Token header.
                import hmac as _hmac
                header_token = (
                    request.headers.get("X-CSRF-Token")
                    or request.headers.get("x-csrf-token")
                    or ""
                )
                if not header_token or not _hmac.compare_digest(header_token, cookie_token):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "error": {
                                "code": "CSRF_FORBIDDEN",
                                "message": "CSRF token invalide ou manquant. "
                                          "Header X-CSRF-Token doit correspondre au cookie lab_csrf_token.",
                            }
                        },
                    )
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    if settings.environment == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    # P1-CSP fix (INSPECT-FRONTEND F-CRIT-12): Content-Security-Policy header
    # closes the XSS attack surface. Combined with P0-04 (no token in
    # sessionStorage) the attack surface is drastically reduced.
    # Tighten progressively after audit (e.g. add 'unsafe-hashes' -> hashes).
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self' data:; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' https://login.microsoftonline.com https://api.openai.com "
        "wss://*.onrender.com https://*.openstreetmap.org https://server.arcgisonline.com "
        "https://nominatim.openstreetmap.org; "
        "frame-ancestors 'none'; "
        "base-uri 'self'"
    )
    return response


def _active_control_mode():
    # La version actuelle reste N2/simulation par conception ; aucun flag ne
    # doit pouvoir faire apparaître un état matériel disponible.
    return 'simulation'


@app.get('/api/health')
def health():
    try:
        connected = ping_database()
        database = 'connected' if connected else 'disconnected'
    except Exception:
        connected = False
        database = 'disconnected'
    # Contrat public stable : le client connecté doit refuser de démarrer
    # si ces quatre champs ne sont pas présents avec leur type attendu.
    return {
        'status': 'ok' if connected else 'degraded',
        'version': app.version,
        'db': database,
        'oidc': 'configured' if settings.oidc and _is_microsoft_entra_issuer(settings.oidc['issuer']) else 'not_configured',
    }


@app.get('/api/platform/config.js', include_in_schema=False)
def platform_config():
    """Public, non-secret runtime configuration consumed by the React cockpit."""
    oidc_enabled = bool(settings.oidc and _is_microsoft_entra_issuer(settings.oidc['issuer']))
    provider = 'Microsoft Entra ID' if oidc_enabled else ''
    script = (
        'window.__MANUS_CONFIG__ = '
        + __import__('json').dumps({
            'projectId': 'aeromind-ai',
            'oauthPortalUrl': '/api/auth/oidc/login',
            'apiUrl': '/api',
            'apiBrowserKey': '',
            'externalOidcEnabled': oidc_enabled,
            'externalOidcProvider': provider,
        }, separators=(',', ':'))
        + ';'
    )
    return Response(content=script, media_type='application/javascript', headers={'Cache-Control': 'no-store'})


def _workspace_db_get(key: str) -> dict | None:
    """V5 LOT B / R-04 — fetch anonymous workspace from DB (canonical store).

    Returns None if the workspace doesn't exist or has expired. The in-memory
    ``_local_workspaces`` dict is a fallback only when the DB is unavailable;
    reading it first can serve stale data on a different application worker.
    Expired rows are purged on access (lazy TTL enforcement).
    """
    try:
        from .database import SessionLocal
        from .models import AnonymousWorkspace
        from datetime import UTC, datetime
        from sqlalchemy import select, delete
        with SessionLocal() as db:
            # Lazy purge of expired workspaces (cheap — indexed on expires_at)
            now = datetime.now(UTC)
            db.execute(delete(AnonymousWorkspace).where(AnonymousWorkspace.expires_at < now))
            row = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
            if row is None:
                _local_workspaces.pop(key, None)
                # Commit the lazy purge before returning so the DELETE is
                # persisted (otherwise the session rollback discards it).
                db.commit()
                return None
            try:
                payload = __import__('json').loads(row.data_json or "{}")
            except Exception:
                payload = {}
            db.commit()
        # Re-populate the cache so subsequent reads stay fast on this worker.
        _local_workspaces[key] = payload
        return payload
    except Exception as exc:  # noqa: BLE001
        # DB unavailable — degrade to in-memory only (dev / migration / SQLite :memory:)
        return _local_workspaces.get(key)


def _workspace_db_put(key: str, payload: dict, origin_ip: str | None = None) -> bool:
    """V5 LOT B / R-04 — persist anonymous workspace to DB (canonical store).

    Uses ``INSERT OR REPLACE`` semantics so the row is created or updated
    atomically. The TTL is refreshed on every PUT (sliding expiration).
    The in-memory cache is also updated so subsequent GETs on this worker
    stay fast.
    """
    # Hot path: update cache
    _local_workspaces[key] = payload
    # Bound the in-memory cache to MAX_ANONYMOUS_WORKSPACES (FIFO eviction)
    if len(_local_workspaces) > MAX_ANONYMOUS_WORKSPACES:
        try:
            oldest = next(iter(_local_workspaces))
            _local_workspaces.pop(oldest, None)
        except StopIteration:
            pass
    # DB canonical
    try:
        import json as _json
        from .database import SessionLocal
        from .models import AnonymousWorkspace
        from datetime import UTC, datetime, timedelta
        from sqlalchemy import select
        data_json = _json.dumps(payload, ensure_ascii=False)
        ttl_seconds = int(os.getenv('AEROMIND_WORKSPACE_TTL_SECONDS', '604800'))  # 7 days default
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        with SessionLocal() as db:
            existing = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
            if existing is None:
                db.add(AnonymousWorkspace(
                    id=key,
                    data_json=data_json,
                    expires_at=expires_at,
                    origin_ip=origin_ip,
                ))
            else:
                existing.data_json = data_json
                existing.expires_at = expires_at
                if origin_ip:
                    existing.origin_ip = origin_ip
            db.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        # DB unavailable — degrade to in-memory only. The cache is already
        # populated above for local continuity, but callers must not report a
        # canonical persistence acknowledgement.
        print(f"WARNING: anonymous workspace DB persist failed ({type(exc).__name__}); "
              f"degraded to in-memory only — workspace will not survive restart.",
              flush=True)
        return False


def _workspace_db_delete(key: str) -> None:
    """Delete one anonymous workspace from cache and canonical storage."""
    _local_workspaces.pop(key, None)
    try:
        from .database import SessionLocal
        from .models import AnonymousWorkspace
        from sqlalchemy import delete
        with SessionLocal() as db:
            db.execute(delete(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
            db.commit()
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: anonymous workspace delete failed ({type(exc).__name__})", flush=True)


@app.post('/api/auth/dev-login')
async def dev_login(request: Request):
    """Development-only login — bypasses OIDC for local development.

    Creates or reuses a dev user in admin_accounts, signs a session token,
    and returns it. Only available when AEROMIND_ENV=development.
    """
    # P1-obs TODO: rate-limit this endpoint with slowapi (5/minute) — see inspection report F-9.5
    if settings.environment != 'development':
        return JSONResponse(status_code=403, content={'error': {'code': 'DEV_LOGIN_FORBIDDEN', 'message': 'Connexion développement disponible uniquement en mode développement.'}})
    import json as _json
    from .oidc import _signed, _b64
    from .admin import reconcile_primary_identity
    primary = reconcile_primary_identity()
    if primary is None:
        return JSONResponse(status_code=503, content={'error': {'code': 'PRIMARY_ADMIN_NOT_CONFIGURED', 'message': 'Adresse Super-Admin principale non configurée.'}})
    dev_email = primary['email'].casefold()
    dev_user_id = primary['id']
    # Development login is a local convenience for the configured primary admin.
    token = _signed(_b64(f'{dev_user_id}|{dev_email}'.encode()))
    # P-LOGOUT-3 fix: register the dev-login session in the server-side
    # allowlist so revoke_primary_session() can actually invalidate it on
    # logout (previously dev-login tokens were un-revocable).
    try:
        from .primary_session_store import register_primary_session
        register_primary_session(token, dev_user_id, dev_email)
    except Exception:  # noqa: BLE001 — best-effort, must not block dev-login
        pass
    response = JSONResponse({
        'user': {'id': dev_user_id, 'email': dev_email, 'name': primary.get('name', 'Administrateur principal'), 'role': 'super_admin', 'level': 'L4', 'accountStatus': 'active'},
        'token': token,
    })
    # P-LOGOUT-5 fix: reduce dev-login cookie lifetime from 24h to 8h to
    # match OIDC/local-MFA sessions (28800s = 8h). This limits the window
    # during which a stolen cookie can be replayed.
    response.set_cookie('aeromind_session', token, httponly=True, samesite='lax', max_age=28800)
    return response


@app.get('/api/auth/dev-status')
async def dev_status():
    """Check if development login is available."""
    return {
        'devLoginAvailable': settings.environment == 'development',
        'oidcConfigured': bool(settings.oidc),
        'environment': settings.environment,
    }


@app.get('/api/local/workspace')
async def get_local_workspace(request: Request):
    """Return the anonymous browser workspace as JSON, never the SPA shell.

    V5 LOT B / R-04 — the workspace is now persisted in the
    ``anonymous_workspaces`` DB table (with TTL, sliding expiration, and
    lazy purge of expired rows). The in-memory ``_local_workspaces`` dict
    is a hot-path cache on top of the DB canonical store. Workspaces
    survive worker restart and are visible across workers.

    P0-05 fix — the previous implementation used a single shared
    ``'default'`` cache key when the ``X-AeroMind-Workspace`` header was
    absent, so two anonymous browsers could read or overwrite each other's
    drafts. The key is now derived from a per-client random workspace
    identifier issued server-side and validated for shape; the shared
    ``'default'`` key is removed entirely. Anonymous clients MUST send a
    non-empty ``X-AeroMind-Workspace`` header (a UUID or similar opaque
    token) — otherwise the endpoint responds 400 BAD_REQUEST. Authenticated
    clients should not use this endpoint; their workspace is loaded via
    /api/lab/projects/{id}/drones/active from the canonical source of truth.
    """
    raw_key = request.headers.get('X-AeroMind-Workspace', '').strip()
    if not raw_key or not _is_valid_workspace_key(raw_key):
        return JSONResponse(
            status_code=400,
            content={'error': {
                'code': 'WORKSPACE_KEY_REQUIRED',
                'message': (
                    "Un identifiant de workspace (header X-AeroMind-Workspace, "
                    "32 à 128 caractères alphanumériques) est requis pour isoler "
                    "les brouillons anonymes (P0-05)."
                ),
            }},
            headers={'Cache-Control': 'no-store'},
        )
    payload = _workspace_db_get(raw_key)
    return {'workspace': payload, 'source': 'LOCAL'}


@app.put('/api/local/workspace')
async def put_local_workspace(request: Request):
    """Store an explicitly local snapshot; this does not imply server evidence.

    V5 LOT B / R-04 — persists the workspace to the DB canonical store
    (anonymous_workspaces table) with sliding TTL. The in-memory cache is
    updated first so the response is fast; the DB write happens behind.

    P0-05 fix — Same key-isolation contract as the GET path: each anonymous
    client MUST supply its own ``X-AeroMind-Workspace`` key; the shared
    ``'default'`` key is rejected. Authenticated clients should persist via
    the canonical API.
    """
    raw_key = request.headers.get('X-AeroMind-Workspace', '').strip()
    if not raw_key or not _is_valid_workspace_key(raw_key):
        return JSONResponse(
            status_code=400,
            content={'error': {
                'code': 'WORKSPACE_KEY_REQUIRED',
                'message': (
                    "Un identifiant de workspace (header X-AeroMind-Workspace, "
                    "32 à 128 caractères alphanumériques) est requis pour isoler "
                    "les brouillons anonymes (P0-05)."
                ),
            }},
            headers={'Cache-Control': 'no-store'},
        )
    try:
        body = await request.json()
    except Exception as exc:
        return JSONResponse(status_code=400, content={'error': {'code': 'INVALID_JSON', 'message': str(exc)}})
    workspace = body.get('workspace') if isinstance(body, dict) else None
    if not isinstance(workspace, dict):
        return JSONResponse(status_code=422, content={'error': {'code': 'INVALID_WORKSPACE', 'message': 'workspace object required'}})
    if workspace.get('physicalOutputEnabled') is not False:
        return JSONResponse(status_code=422, content={'error': {'code': 'PHYSICAL_OUTPUT_FORBIDDEN', 'message': 'physicalOutputEnabled must remain false'}})
    origin_ip = request.client.host if request.client else None
    if not _workspace_db_put(raw_key, workspace, origin_ip=origin_ip):
        return JSONResponse(status_code=503, content={'error': {
            'code': 'WORKSPACE_PERSISTENCE_FAILED',
            'message': 'Le workspace reste local à ce worker : la persistance canonique n’est pas confirmée.',
        }}, headers={'Cache-Control': 'no-store'})
    return {'ok': True, 'source': 'LOCAL', 'updatedAt': workspace.get('updatedAt')}


@app.delete('/api/local/workspace')
async def delete_local_workspace(request: Request):
    """Clear the current anonymous browser workspace on logout."""
    raw_key = request.headers.get('X-AeroMind-Workspace', '').strip()
    if not raw_key or not _is_valid_workspace_key(raw_key):
        return JSONResponse(status_code=400, content={'error': {
            'code': 'WORKSPACE_KEY_REQUIRED',
            'message': 'Un identifiant de workspace valide est requis.',
        }}, headers={'Cache-Control': 'no-store'})
    _workspace_db_delete(raw_key)
    return {'deleted': True, 'source': 'LOCAL'}


def _current_user(aeromind_session: str | None, authorization: str | None = None):
    return resolve_current_user(aeromind_session, authorization)


def _trpc_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={'error': {'json': {'code': code, 'message': message}}},
        headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'},
    )


@app.api_route('/api/trpc/{procedure:path}', methods=['GET', 'POST'], include_in_schema=False)
async def trpc_compat(
    request: Request,
    procedure: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Small compatibility bridge for the legacy React query layer.

    Business operations remain on the Python API; these responses prevent the
    old client bootstrap queries from failing while the cockpit migrates away
    from the former Node/tRPC server.
    """
    name = procedure.split('?')[0].rstrip('/').replace('/', '.')
    current_user = _current_user(aeromind_session, authorization)
    if any(name.endswith(suffix) for suffix in (
        'superAdmin.accounts', 'superAdmin.activity',
        'superAdmin.createAccount', 'superAdmin.updateAccount',
        'superAdmin.deleteAccount', 'superAdmin.rotateAuthorizationCode', 'superAdmin.resetLocalAuth', 'superAdmin.issueDailyTotpCode', 'superAdmin.saveProject', 'superAdmin.observeProject', 'superAdmin.deleteProject',
        'superAdmin.updateSuperadminAccount', 'superAdmin.updateSuperadminEmail',
        'superAdmin.deleteSuperadminAccount',
        'superAdmin.rotateSuperadminAuthorizationCode',
        'superAdmin.resetSuperadminLocalAuth',
        'superAdmin.clearAuditLog',
    )):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        if current_user['role'] != 'super_admin':
            return _trpc_error(403, 'FORBIDDEN', 'Super-Admin permission required')
    payload: dict = {}
    if request.method == 'GET':
        encoded_input = request.query_params.get('input')
        if encoded_input:
            try:
                raw_payload = _json.loads(encoded_input)
                payload = raw_payload.get('json', raw_payload) if isinstance(raw_payload, dict) else raw_payload
            except (_json.JSONDecodeError, TypeError):
                return _trpc_error(400, 'BAD_REQUEST', 'Invalid tRPC query input')
    elif request.method == 'POST':
        try:
            raw_payload = await request.json()
            if isinstance(raw_payload, list):
                raw_payload = raw_payload[0] if raw_payload else {}
            payload = raw_payload.get('json', raw_payload) if isinstance(raw_payload, dict) else {}
        except Exception:
            payload = {}
    if name.endswith('auth.me'):
        data = current_user
    elif name.endswith('auth.logout'):
        data = {'logged_out': True}
    elif name.endswith('identity.providers'):
        data = [{'id': 'entra', 'label': 'Microsoft Entra ID', 'domains': 'Microsoft 365 / Entra', 'note': 'Connexion OIDC sécurisée', 'configured': bool(settings.oidc)}, {'id': 'local-mfa', 'label': 'Accès local AeroMind', 'domains': 'Comptes préprovisionnés', 'note': 'Mot de passe + TOTP; invitation admin requise', 'configured': True}]
    elif name.endswith('ai.status'):
        data = {'available': bool(settings.openai_api_key), 'provider': 'OpenAI-compatible' if settings.openai_api_key else 'local'}
    elif name.endswith('labBench.status'):
        data = labbench_service.status()
    elif name.endswith('labBench.runSimulation'):
        try:
            data = labbench_service.run_simulation(payload)
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.validateCommand'):
        try:
            data = labbench_service.validate_command(payload)
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.seedRegistry'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.seed_registry(db, current_user, str(project_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.persistSimulation'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.persist_simulation(db, current_user, str(project_id or ''), payload)
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.createReport'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            run_id = payload.get('runId') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.create_report(db, current_user, str(project_id or ''), str(run_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('superAdmin.accounts'):
        data = list_accounts()
    elif name.endswith('superAdmin.activity'):
        data = admin_activity()
    elif name.endswith('superAdmin.createAccount'):
        try:
            data = create_account(current_user, payload.get('email', ''), payload.get('name', ''), payload.get('role', 'user'), payload.get('level', 'L1'))
        except ValueError as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.updateAccount'):
        try:
            account_id = str(payload.get('id', ''))
            changes = {key: value for key, value in payload.items() if key != 'id'}
            data = update_account(current_user, account_id, changes)
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.deleteAccount'):
        try:
            data = delete_account(current_user, str(payload.get('id', '')), bool(payload.get('permanent', False)))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.rotateAuthorizationCode'):
        try:
            data = rotate_authorization_code(current_user, str(payload.get('id', '')))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.resetLocalAuth'):
        try:
            data = reset_local_auth(current_user, str(payload.get('id', '')))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.updateSuperadminAccount'):
        try:
            account_id = str(payload.get('id', ''))
            changes = {key: value for key, value in payload.items() if key != 'id'}
            data = update_superadmin_account(current_user, account_id, changes)
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.updateSuperadminEmail'):
        try:
            account_id = str(payload.get('id', ''))
            new_email = str(payload.get('email', '')).strip()
            data = update_superadmin_account(current_user, account_id, {'email': new_email})
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.deleteSuperadminAccount'):
        try:
            data = delete_superadmin_account(current_user, str(payload.get('id', '')), bool(payload.get('permanent', False)))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.rotateSuperadminAuthorizationCode'):
        try:
            data = rotate_superadmin_authorization_code(current_user, str(payload.get('id', '')))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.resetSuperadminLocalAuth'):
        try:
            data = reset_superadmin_local_auth(current_user, str(payload.get('id', '')))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.issueDailyTotpCode'):
        try:
            data = issue_daily_totp_code(current_user, str(payload.get('id', '')))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('superAdmin.saveProject') or name.endswith('superAdmin.observeProject') or name.endswith('superAdmin.deleteProject'):
        try:
            action = 'save' if name.endswith('superAdmin.saveProject') else 'observe' if name.endswith('superAdmin.observeProject') else 'delete'
            data = update_project_control(current_user, str(payload.get('id', '')), action)
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('projects.list'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        with SessionLocal() as db:
            data = []
            for record in db.scalars(select(Project).where(Project.user_id.in_({current_user['id'], current_user.get('subject')})).order_by(Project.created_at.desc())):
                body = __import__('json').loads(record.data_json or '{}')
                data.append({'id': record.id, 'project': body.get('project', {'name': record.name, 'status': 'active', 'version': '1.0'}), 'config': body.get('config', {}), 'requirements': body.get('requirements', []), 'runId': body.get('runId', 'SIM-000')})
    elif name.endswith('projects.create'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        if current_user.get('role') == 'visitor':
            return _trpc_error(403, 'FORBIDDEN', 'Le rôle Visiteur ne peut pas créer de projet persistant')
        import json, traceback
        project_id, drone_id = str(uuid4()), str(uuid4())
        config = payload.get('config', {}) if isinstance(payload.get('config', {}), dict) else {}
        config = {**config, 'airframe': config.get('airframe') or 'quadcopter', 'motorCount': config.get('motorCount') or 4, 'massKg': config.get('massKg') or 1.2, 'batteryWh': config.get('batteryWh') or 100}
        project_data = {'project': payload.get('project', {}), 'config': config, 'requirements': payload.get('requirements', []), 'runId': payload.get('runId', 'SIM-000')}
        try:
            # V6.2 — use the app-level SessionLocal (patched in tests, the
            # correct engine in production) instead of a lazily imported one.
            with SessionLocal() as db:
                if current_user.get('role') == 'demo' and db.scalar(select(Project).where(Project.user_id == current_user['id'])) is not None:
                    return _trpc_error(403, 'DEMO_LIMIT_REACHED', 'Le compte Démo est limité à un projet')
                # V6.2 — ensure the user row exists before creating the project
                # (FK constraint: Project.user_id → users.id). The user might
                # not have a row in the users table yet if they authenticated
                # via OIDC but never had a project created.
                existing_user = db.get(User, current_user['id'])
                if existing_user is None:
                    db.add(User(id=current_user['id'], email=current_user['email']))
                    db.flush()
                db.add(Project(id=project_id, user_id=current_user['id'],
                               name=project_data['project'].get('name', 'Nouveau projet'),
                               data_json=json.dumps(project_data, ensure_ascii=False),
                               active_drone_id=drone_id))
                db.flush()  # ensure project exists before creating drone (FK)
                db.add(Drone(id=drone_id, user_id=current_user['id'], project_id=project_id,
                             name='Drone par défaut', config_json=json.dumps(project_data['config'], ensure_ascii=False)))
                db.commit()
        except Exception as exc:
            # V6.2 — log the full traceback so the operator can diagnose the
            # root cause (FK violation, NOT NULL constraint, connection error,
            # etc.) instead of seeing only the generic 503 message.
            print(f'PROJECT_CREATE_FAILED user={current_user.get("email")} '
                  f'error={type(exc).__name__}: {exc}\n{traceback.format_exc()}', flush=True)
            return _trpc_error(503, 'PROJECT_PERSISTENCE_FAILED',
                                f'La base métier ne confirme pas la création du projet: {type(exc).__name__}: {exc}')
        data = {'id': project_id, **project_data}
    elif name.endswith('simulationRuns.list'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        with SessionLocal() as db:
            records = db.scalars(select(Simulation).where(Simulation.user_id == current_user['id'], Simulation.project_id == str(payload or ''))).all()
            data = [__import__('json').loads(x.data_json) for x in records]
    elif name.endswith('simulationRuns.create'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        import json
        project_id = str(payload.get('id', ''))
        with SessionLocal() as db:
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id.in_({current_user['id'], current_user.get('subject')})))
            if project is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            result = payload.get('result', {})
            record = Simulation(id=str(uuid4()), user_id=current_user['id'], project_id=project_id, data_json=json.dumps({'runId': result.get('runId', 'SIM-001'), 'version': '1.0', 'result': result, 'config': payload.get('config', {})}))
            db.add(record); db.commit(); data = json.loads(record.data_json)
    elif name.endswith('projects.delete'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        project_id = str(payload.get('id', payload) if isinstance(payload, dict) else payload)
        with SessionLocal() as db:
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id.in_({current_user['id'], current_user.get('subject')})))
            if project is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            db.delete(project); db.commit(); data = {'deleted': True}
    elif name.endswith('projects.saveSnapshot'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        import json
        project_id = str(payload.get('id', ''))
        with SessionLocal() as db:
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id.in_({current_user['id'], current_user.get('subject')})))
            if project is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            previous = json.loads(project.data_json or '{}')
            state = {'project': payload.get('project', {}), 'config': payload.get('config', {}), 'requirements': payload.get('requirements', []), 'runId': payload.get('runId', 'SIM-000')}
            # A user snapshot must not erase a Super-Admin control decision.
            admin_control = previous.get('adminControl')
            if isinstance(admin_control, dict) and admin_control.get('status') in {'saved', 'observed'}:
                state['adminControl'] = admin_control
                state['project']['status'] = admin_control['status']
            project.name = state['project'].get('name', project.name); project.data_json = json.dumps(state)
            if project.active_drone_id:
                drone = db.get(Drone, project.active_drone_id)
                if drone is not None: drone.config_json = json.dumps(state['config'])
            db.commit(); data = {'id': project_id, **state}
    elif name.endswith('reports.create'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        if current_user.get('role') in {'demo', 'visitor'}:
            return _trpc_error(403, 'FORBIDDEN', 'Ce niveau de compte ne peut pas soumettre un rapport officiel')
        import json
        project_id = str(payload.get('id', ''))
        with SessionLocal() as db:
            if db.scalar(select(Project).where(Project.id == project_id, Project.user_id.in_({current_user['id'], current_user.get('subject')}))) is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            report_payload = {**payload, 'status': 'draft', 'workflow': {'submittedAt': None, 'reviewerId': None, 'approverId': None, 'reviewerComment': None, 'approverComment': None}}
            record = Report(id=str(uuid4()), user_id=current_user['id'], project_id=project_id, data_json=json.dumps(report_payload)); db.add(record); db.commit(); data = {'id': record.id, **report_payload}
    elif name.endswith('reports.submit'):
        if not current_user: return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        import json
        report_id = str(payload.get('id', ''))
        authorization_code = str(payload.get('authorizationCode', '')).strip()
        if not verify_authorization_code(current_user['email'], authorization_code):
            return _trpc_error(403, 'AUTHORIZATION_CODE_REQUIRED', 'Code personnel AeroMind invalide ou absent')
        with SessionLocal() as db:
            record = db.scalar(select(Report).where(Report.id == report_id, Report.user_id == current_user['id']))
            if record is None: return _trpc_error(404, 'NOT_FOUND', 'Report not found')
            body = json.loads(record.data_json or '{}'); body['status'] = 'submitted'; body.setdefault('workflow', {}).update({'submittedAt': time.time(), 'authorizationCodeVerified': True, 'recipients': ['surveillant', 'super_admin'], 'notificationState': 'queued_for_review'}); record.data_json = json.dumps(body); db.commit(); data = {'id': record.id, **body}
    elif name.endswith('reports.list'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        with SessionLocal() as db:
            query = select(Report).where(Report.project_id.in_(select(Project.id).where(Project.user_id == current_user['id']))) if current_user.get('role') not in {'surveillant', 'admin', 'super_admin'} else select(Report)
            data = [{'id': r.id, 'projectId': r.project_id, **__import__('json').loads(r.data_json or '{}')} for r in db.scalars(query.order_by(Report.created_at.desc()).limit(100))]
    elif name.endswith('reports.review'):
        if not current_user or current_user.get('role') not in {'surveillant', 'admin', 'super_admin'}:
            return _trpc_error(403, 'FORBIDDEN', 'Rôle Surveillant requis')
        import json
        with SessionLocal() as db:
            record = db.get(Report, str(payload.get('id', '')))
            if record is None: return _trpc_error(404, 'NOT_FOUND', 'Report not found')
            body = json.loads(record.data_json or '{}')
            if record.user_id == current_user['id']: return _trpc_error(403, 'FORBIDDEN', 'Un rapport ne peut pas être revu par son auteur')
            body['status'] = 'reviewed_by_supervisor'; body.setdefault('workflow', {}).update({'reviewerId': current_user['id'], 'reviewerComment': payload.get('comment', '')}); record.data_json = json.dumps(body); db.commit(); data = {'id': record.id, **body}
    elif name.endswith('reports.approve'):
        if not current_user or current_user.get('role') not in {'admin', 'super_admin'}:
            return _trpc_error(403, 'FORBIDDEN', 'Approbation Super-Admin requise')
        import json
        with SessionLocal() as db:
            record = db.get(Report, str(payload.get('id', '')))
            if record is None: return _trpc_error(404, 'NOT_FOUND', 'Report not found')
            body = json.loads(record.data_json or '{}')
            if body.get('status') != 'reviewed_by_supervisor': return _trpc_error(409, 'REVIEW_REQUIRED', 'Le rapport doit être contrôlé par un surveillant')
            body['status'] = 'approved_by_admin'; body.setdefault('workflow', {}).update({'approverId': current_user['id'], 'approverComment': payload.get('comment', '')}); record.data_json = json.dumps(body); db.commit(); data = {'id': record.id, **body}
    elif name.endswith('auditEvents.record'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        project_id = str(payload.get('projectId') or payload.get('id') or '').strip()
        event_type = str(payload.get('eventType') or '').strip()
        message = payload.get('message')
        details = payload.get('details')
        if details is None:
            details = payload.get('payload', {})
        if not message and isinstance(details, dict):
            message = details.get('message')
        if event_type not in {'validation.action', 'validation.checkpoint'}:
            return _trpc_error(400, 'BAD_REQUEST', 'Unsupported audit event type')
        if not isinstance(message, str) or not message.strip() or len(message.strip()) > 500:
            return _trpc_error(400, 'BAD_REQUEST', 'Audit message must contain 1–500 characters')
        if not isinstance(details, dict):
            return _trpc_error(400, 'BAD_REQUEST', 'Audit details must be an object')
        if details.get('scope') != 'local-simulation-only' or details.get('physicalOutputEnabled') is not False:
            return _trpc_error(400, 'BAD_REQUEST', 'Only explicitly local, non-physical validation events can be recorded')
        try:
            event_id = str(UUID(str(payload.get('eventId') or uuid4())))
            details_json = _json.dumps(details, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
            if len(details_json.encode('utf-8')) > 16000:
                return _trpc_error(413, 'PAYLOAD_TOO_LARGE', 'Audit details exceed 16 KB')
            occurred_raw = payload.get('occurredAt') or details.get('recordedAt')
            occurred_at = datetime.fromisoformat(str(occurred_raw).replace('Z', '+00:00')) if occurred_raw else datetime.now(UTC)
            occurred_at = occurred_at.replace(tzinfo=UTC) if occurred_at.tzinfo is None else occurred_at.astimezone(UTC)
        except (ValueError, TypeError, _json.JSONDecodeError):
            return _trpc_error(400, 'BAD_REQUEST', 'Invalid audit event identifier, timestamp or details')
        with SessionLocal() as db:
            project = db.get(Project, project_id)
            if project is None:
                return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            if project.user_id != current_user['id']:
                return _trpc_error(403, 'FORBIDDEN', 'Only the project owner can record validation events')
            row = db.get(AuditEvent, event_id)
            if row is not None:
                if row.user_id != current_user['id'] or row.project_id != project_id:
                    return _trpc_error(409, 'EVENT_ID_CONFLICT', 'This audit event identifier is already in use')
                if row.event_type != event_type or row.message != message.strip() or row.payload_json != details_json:
                    return _trpc_error(409, 'EVENT_ID_CONFLICT', 'A repeated audit identifier must have identical content')
            else:
                row = AuditEvent(
                    id=event_id,
                    project_id=project_id,
                    user_id=current_user['id'],
                    actor_role=current_user.get('role', 'user'),
                    event_type=event_type,
                    message=message.strip(),
                    payload_json=details_json,
                    occurred_at=occurred_at,
                )
                db.add(row)
                try:
                    db.commit()
                except SQLAlchemyError as exc:
                    db.rollback()
                    print(f'AUDIT_EVENT_PERSIST_FAILED project={project_id} error={type(exc).__name__}', flush=True)
                    return _trpc_error(503, 'AUDIT_PERSISTENCE_FAILED', 'The audit event could not be persisted')
            data = {
                'id': row.id,
                'projectId': row.project_id,
                'eventType': row.event_type,
                'message': row.message,
                'payload': _json.loads(row.payload_json or '{}'),
                'actorId': row.user_id,
                'actorRole': row.actor_role,
                'occurredAt': (row.occurred_at.replace(tzinfo=UTC) if row.occurred_at.tzinfo is None else row.occurred_at.astimezone(UTC)).isoformat(),
                'createdAt': (row.created_at.replace(tzinfo=UTC) if row.created_at.tzinfo is None else row.created_at.astimezone(UTC)).isoformat(),
            }
    elif name.endswith('auditEvents.list'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        project_id = payload if isinstance(payload, str) else str(payload.get('projectId') or payload.get('id') or '') if isinstance(payload, dict) else ''
        if not project_id:
            return _trpc_error(400, 'BAD_REQUEST', 'A project id is required')
        with SessionLocal() as db:
            project = db.get(Project, str(project_id))
            if project is None:
                return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            if project.user_id != current_user['id']:
                return _trpc_error(403, 'FORBIDDEN', 'Only the project owner can read validation events')
            rows = db.scalars(
                select(AuditEvent)
                .where(AuditEvent.project_id == project.id, AuditEvent.user_id == current_user['id'])
                .order_by(AuditEvent.occurred_at.desc(), AuditEvent.created_at.desc())
                .limit(200)
            ).all()
            data = [
                {
                    'id': row.id,
                    'projectId': row.project_id,
                    'eventType': row.event_type,
                    'message': row.message,
                    'payload': _json.loads(row.payload_json or '{}'),
                    'actorId': row.user_id,
                    'actorRole': row.actor_role,
                    'occurredAt': (row.occurred_at.replace(tzinfo=UTC) if row.occurred_at.tzinfo is None else row.occurred_at.astimezone(UTC)).isoformat(),
                    'createdAt': (row.created_at.replace(tzinfo=UTC) if row.created_at.tzinfo is None else row.created_at.astimezone(UTC)).isoformat(),
                }
                for row in rows
            ]
    elif name.endswith('designVersions.list'):
        data = []
    elif name.endswith('labBench.registry'):
        try:
            project_id = payload if isinstance(payload, str) else payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.registry(db, current_user, str(project_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.gateState'):
        try:
            project_id = payload if isinstance(payload, str) else payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.gate_state(db, current_user, str(project_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.completeHardwareChecklist'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.complete_hardware_checklist(db, current_user, str(project_id or ''), payload if isinstance(payload, dict) else {})
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.armN3'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.arm_n3_gate(db, current_user, str(project_id or ''), payload if isinstance(payload, dict) else {})
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.disarmN3'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.disarm_n3_gate(db, current_user, str(project_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.signOffN4'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.sign_off_n4_gate(db, current_user, str(project_id or ''), payload if isinstance(payload, dict) else {})
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.fleetGateState'):
        try:
            project_id = payload if isinstance(payload, str) else payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.fleet_gate_state(db, current_user, str(project_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.perDroneGateState'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            drone_id = payload.get('droneId') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.per_drone_gate_state(db, current_user, str(project_id or ''), str(drone_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.completeHardwareChecklistDrone'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            drone_id = payload.get('droneId') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.complete_hardware_checklist_drone(db, current_user, str(project_id or ''), str(drone_id or ''), payload if isinstance(payload, dict) else {})
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.armN3Drone'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            drone_id = payload.get('droneId') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.arm_n3_gate_drone(db, current_user, str(project_id or ''), str(drone_id or ''), payload if isinstance(payload, dict) else {})
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.disarmN3Drone'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            drone_id = payload.get('droneId') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.disarm_n3_gate_drone(db, current_user, str(project_id or ''), str(drone_id or ''))
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    elif name.endswith('labBench.runFleetSimulation'):
        try:
            project_id = payload.get('projectId') or payload.get('id') if isinstance(payload, dict) else ''
            with SessionLocal() as db:
                data = labbench_service.run_fleet_simulation(db, current_user, str(project_id or ''), payload if isinstance(payload, dict) else {})
        except labbench_service.LabBenchError as exc:
            return _trpc_error(exc.status_code, exc.code, exc.message)
    # ───────────────────────────────────────────────────────────────────────
    # auditEventsExt.* — per-user tamper-evident audit log (EXIGENCE IAM-05)
    # ───────────────────────────────────────────────────────────────────────
    # The audit_events_ext table is the canonical hash-chained journal. It is
    # append-only at the PostgreSQL level (audit_ext_no_update_delete trigger
    # in migrations/2026-10-25_canonical_labbench_schema.sql). The dev SQLite
    # profile created the table manually WITHOUT that trigger, so the per-user
    # DELETE / CLEAR procedures below only succeed in dev. In production they
    # raise a clear HTTP 409 with the message defined in
    # web.admin._safe_table_delete(); the audit_events_ext rows are immutable
    # there by design.
    elif name.endswith('auditEventsExt.list'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        from .canonical_models import AuditEventExt
        from sqlalchemy import inspect as _sa_inspect
        # The dev SQLite profile may not have applied the canonical migration
        # — return an empty result instead of 500 when the table is missing
        # so the React audit journal view renders cleanly on a fresh boot.
        if not _sa_inspect(engine).has_table('audit_events_ext'):
            data = {'events': [], 'nextCursor': None, 'totalCount': 0}
        else:
            action_filter = str(payload.get('actionFilter') or payload.get('action_filter') or '').strip() if isinstance(payload, dict) else ''
            decision_filter = str(payload.get('decisionFilter') or payload.get('decision_filter') or '').strip() if isinstance(payload, dict) else ''
            try:
                limit = int(payload.get('limit') or 200) if isinstance(payload, dict) else 200
            except (TypeError, ValueError):
                limit = 200
            limit = max(1, min(limit, 1000))
            cursor_raw = payload.get('cursor') if isinstance(payload, dict) else None
            cursor_dt = None
            if cursor_raw:
                try:
                    cursor_dt = datetime.fromisoformat(str(cursor_raw).replace('Z', '+00:00'))
                    if cursor_dt.tzinfo is None:
                        cursor_dt = cursor_dt.replace(tzinfo=UTC)
                except (TypeError, ValueError):
                    return _trpc_error(400, 'BAD_REQUEST', 'Invalid cursor (expected ISO 8601 datetime)')
            with SessionLocal() as db:
                query = select(AuditEventExt).where(AuditEventExt.actor_id == current_user['id'])
                if action_filter:
                    query = query.where(AuditEventExt.action.like(f'%{action_filter}%'))
                if decision_filter:
                    query = query.where(AuditEventExt.decision == decision_filter)
                if cursor_dt is not None:
                    query = query.where(AuditEventExt.occurred_at < cursor_dt)
                from sqlalchemy import func as _sa_func
                total_count = db.scalar(
                    select(_sa_func.count(AuditEventExt.id)).where(AuditEventExt.actor_id == current_user['id'])
                ) or 0
                rows = db.scalars(
                    query.order_by(AuditEventExt.occurred_at.desc()).limit(limit + 1)
                ).all()
                has_more = len(rows) > limit
                rows = rows[:limit]
                def _iso(dt):
                    if dt is None:
                        return None
                    return (dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)).isoformat()
                events = []
                for row in rows:
                    try:
                        payload_dict = _json.loads(row.payload_json or '{}')
                    except (_json.JSONDecodeError, TypeError):
                        payload_dict = {}
                    events.append({
                        'id': row.id,
                        'actor_id': row.actor_id,
                        'actor_role': row.actor_role,
                        'action': row.action,
                        'resource_id': row.resource_id,
                        'decision': row.decision,
                        'project_id': row.project_id,
                        'drone_id': row.drone_id,
                        'correlation_id': row.correlation_id,
                        'message': row.message,
                        'payload_json': payload_dict,
                        'occurred_at': _iso(row.occurred_at),
                        'prev_hash': row.prev_hash,
                        'chain_hash': row.chain_hash,
                    })
                next_cursor = _iso(rows[-1].occurred_at) if has_more and rows else None
                data = {'events': events, 'nextCursor': next_cursor, 'totalCount': int(total_count)}
    elif name.endswith('auditEventsExt.record'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        from .canonical_models import AuditEventExt
        import hashlib as _hashlib, uuid as _uuid
        from sqlalchemy import inspect as _sa_inspect
        if not _sa_inspect(engine).has_table('audit_events_ext'):
            # Ensure the table exists before attempting the INSERT — the dev
            # profile auto-creates it via lifespan.create_all(), but a
            # freshly-imported app instance (e.g. in tests) might miss it.
            Base.metadata.create_all(bind=engine, tables=[AuditEventExt.__table__])
        if not isinstance(payload, dict):
            return _trpc_error(400, 'BAD_REQUEST', 'Expected JSON object payload')
        action = str(payload.get('action') or '').strip()
        message = str(payload.get('message') or '').strip()
        decision = str(payload.get('decision') or '').strip()
        if not action or not message:
            return _trpc_error(400, 'BAD_REQUEST', 'action and message are required')
        if decision not in ('allow', 'deny', 'error'):
            return _trpc_error(400, 'BAD_REQUEST', "decision must be one of: 'allow', 'deny', 'error'")
        resource_id = str(payload.get('resource_id') or payload.get('resourceId') or '').strip() or None
        project_id = str(payload.get('project_id') or payload.get('projectId') or '').strip() or None
        drone_id = str(payload.get('drone_id') or payload.get('droneId') or '').strip() or None
        payload_dict = payload.get('payload')
        if payload_dict is None:
            payload_dict = {}
        if not isinstance(payload_dict, dict):
            return _trpc_error(400, 'BAD_REQUEST', 'payload must be a JSON object')
        occurred_at = datetime.now(UTC)
        occurred_at_iso = occurred_at.isoformat()
        correlation_id = str(_uuid.uuid4())
        try:
            with SessionLocal() as db:
                # Per-actor hash chain — only the caller's own events
                # participate (vs. the global chain in labbench_auth.audit_decision).
                prev_row = db.scalars(
                    select(AuditEventExt)
                    .where(AuditEventExt.actor_id == current_user['id'])
                    .order_by(AuditEventExt.occurred_at.desc())
                    .limit(1)
                ).first()
                if prev_row is not None and prev_row.chain_hash:
                    prev_hash = _hashlib.sha256(prev_row.chain_hash.encode('utf-8')).hexdigest()
                else:
                    prev_hash = None
                chain_hash = _hashlib.sha256(
                    f"{prev_hash if prev_hash else ''}|{message}|{action}|{occurred_at_iso}".encode('utf-8')
                ).hexdigest()
                record = AuditEventExt(
                    id=str(_uuid.uuid4()),
                    actor_id=current_user['id'],
                    actor_role=str(current_user.get('role', 'user')),
                    action=action,
                    resource_id=resource_id,
                    decision=decision,
                    project_id=project_id,
                    drone_id=drone_id,
                    correlation_id=correlation_id,
                    message=message,
                    payload_json=_json.dumps(payload_dict, ensure_ascii=False, default=str),
                    occurred_at=occurred_at,
                    prev_hash=prev_hash,
                    chain_hash=chain_hash,
                )
                db.add(record)
                db.commit()
                db.refresh(record)
                try:
                    parsed_payload = _json.loads(record.payload_json or '{}')
                except (_json.JSONDecodeError, TypeError):
                    parsed_payload = {}
                iso_dt = (record.occurred_at.replace(tzinfo=UTC)
                          if record.occurred_at.tzinfo is None
                          else record.occurred_at.astimezone(UTC)).isoformat()
                data = {
                    'id': record.id,
                    'actor_id': record.actor_id,
                    'actor_role': record.actor_role,
                    'action': record.action,
                    'resource_id': record.resource_id,
                    'decision': record.decision,
                    'project_id': record.project_id,
                    'drone_id': record.drone_id,
                    'correlation_id': record.correlation_id,
                    'message': record.message,
                    'payload_json': parsed_payload,
                    'occurred_at': iso_dt,
                    'prev_hash': record.prev_hash,
                    'chain_hash': record.chain_hash,
                }
        except SQLAlchemyError as exc:
            return _trpc_error(503, 'AUDIT_PERSISTENCE_FAILED',
                               f'audit_events_ext insert failed: {type(exc).__name__}: {exc}')
    elif name.endswith('auditEventsExt.delete'):
        # IMPORTANT — append-only trigger caveat:
        # In dev (SQLite) the trigger does not exist, so this DELETE works.
        # In prod (PostgreSQL) the audit_ext_no_update_delete trigger blocks
        # DELETE and raises OperationalError. We translate that to HTTP 409.
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        from .canonical_models import AuditEventExt
        from .admin import _is_append_only_trigger_error
        from sqlalchemy import inspect as _sa_inspect
        if not _sa_inspect(engine).has_table('audit_events_ext'):
            return _trpc_error(404, 'NOT_FOUND', 'audit_events_ext table is not initialized')
        event_id = str((payload or {}).get('id', '')) if isinstance(payload, dict) else str(payload or '')
        if not event_id:
            return _trpc_error(400, 'BAD_REQUEST', 'id is required')
        try:
            with SessionLocal() as db:
                row = db.get(AuditEventExt, event_id)
                if row is None or row.actor_id != current_user['id']:
                    data = {'deleted': False, 'id': event_id}
                else:
                    # Use a DELETE WHERE clause so the trigger (if any) sees a
                    # single-statement DELETE on audit_events_ext.
                    deleted_count = db.query(AuditEventExt).filter(
                        AuditEventExt.id == event_id,
                        AuditEventExt.actor_id == current_user['id'],
                    ).delete(synchronize_session=False)
                    db.commit()
                    data = {'deleted': bool(deleted_count), 'id': event_id}
        except SQLAlchemyError as exc:
            if _is_append_only_trigger_error(exc):
                return _trpc_error(409, 'APPEND_ONLY_TRIGGER_ACTIVE',
                                   'Cannot delete from audit_events_ext: append-only trigger is '
                                   'active (production mode). Use the dev SQLite database for '
                                   'delete operations, or temporarily disable the trigger.')
            return _trpc_error(503, 'AUDIT_DELETE_FAILED',
                               f'{type(exc).__name__}: {exc}')
    elif name.endswith('auditEventsExt.clear'):
        # Same trigger caveat as auditEventsExt.delete — works in dev SQLite,
        # raises HTTP 409 in prod PostgreSQL.
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        from .canonical_models import AuditEventExt
        from .admin import _is_append_only_trigger_error
        from sqlalchemy import inspect as _sa_inspect
        if not _sa_inspect(engine).has_table('audit_events_ext'):
            return _trpc_error(404, 'NOT_FOUND', 'audit_events_ext table is not initialized')
        try:
            with SessionLocal() as db:
                deleted_count = db.query(AuditEventExt).filter(
                    AuditEventExt.actor_id == current_user['id'],
                ).delete(synchronize_session=False)
                db.commit()
                data = {'deletedCount': int(deleted_count or 0)}
        except SQLAlchemyError as exc:
            if _is_append_only_trigger_error(exc):
                return _trpc_error(409, 'APPEND_ONLY_TRIGGER_ACTIVE',
                                   'Cannot delete from audit_events_ext: append-only trigger is '
                                   'active (production mode). Use the dev SQLite database for '
                                   'delete operations, or temporarily disable the trigger.')
            return _trpc_error(503, 'AUDIT_CLEAR_FAILED',
                               f'{type(exc).__name__}: {exc}')
    elif name.endswith('superAdmin.clearAuditLog'):
        # Auth guard already enforced above (role == 'super_admin').
        try:
            scope = str((payload or {}).get('scope', 'all') if isinstance(payload, dict) else 'all')
            data = clear_audit_logs(current_user, scope)
        except ValueError as exc:
            # Trigger rejection / unknown scope — surface as 409 / 400.
            if 'append-only' in str(exc).lower():
                return _trpc_error(409, 'APPEND_ONLY_TRIGGER_ACTIVE', str(exc))
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
        except SQLAlchemyError as exc:
            return _trpc_error(503, 'AUDIT_PURGE_FAILED',
                               f'{type(exc).__name__}: {exc}')
    else:
        data = None
    # The legacy React client uses the SuperJSON transformer. Its wire format
    # wraps serialized values under `data.json`; returning a plain object here
    # makes the query look unauthenticated even though the OIDC cookie is valid.
    # httpLink sends one procedure per request (not a batch request). The
    # tRPC wire contract therefore requires one response object, not an array.
    # Returning an array makes auth.me, Super-Admin queries and project
    # mutations look like transport failures in the React client.
    response = JSONResponse({'result': {'data': {'json': data}}})
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Vary'] = 'Cookie'
    return response


@app.get('/api/oidc/login', include_in_schema=False)
def legacy_oidc_login():
    return RedirectResponse('/api/auth/oidc/login', status_code=307)


@app.get('/', response_class=HTMLResponse)
def home():
    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)
    return """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AeroMind AI</title></head><body style="font-family:system-ui;max-width:760px;margin:4rem auto;padding:0 1.5rem">
<h1>AeroMind AI</h1><p>API d’ingénierie et de simulation opérationnelle.</p>
<p id="auth">Vérification de la session…</p>
<p><a href="/api/health">Health</a> · <a href="/api/capabilities">Capabilities</a> · <a href="/api/auth/oidc/login">Connexion Entra/OIDC</a></p>
<script>fetch('/api/auth/oidc/me').then(r=>r.ok?r.json():null).then(x=>{document.getElementById('auth').textContent=x?'Session active : '+x.email:'Non authentifié';}).catch(()=>{document.getElementById('auth').textContent='Session non vérifiée';});</script>
</body></html>"""


@app.get('/favicon.ico', include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get('/api/ready')
def ready():
    try:
        ping_database()
        return {'ready': True, 'database': 'connected', 'mode': _active_control_mode()}
    except Exception as exc:
        raise HTTPException(503, detail={'ready': False, 'database': 'disconnected', 'error': type(exc).__name__})


@app.get('/api/capabilities')
def capabilities():
    return {'service': 'aeromind-ai', 'version': '2.0.0', 'oidc': bool(settings.oidc and _is_microsoft_entra_issuer(settings.oidc['issuer'])), 'identity_provider': 'microsoft-entra' if settings.oidc and _is_microsoft_entra_issuer(settings.oidc['issuer']) else None, 'llm': bool(settings.openai_api_key), 'sitl': True, 'hardware_control': False, 'virtual_control': True, 'mission_upload': False, 'telemetry_write': False}


@app.get('/api/labbench/gates', include_in_schema=False)
def labbench_gates_get(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """REST mirror of the tRPC `labBench.gateState` procedure for external tools.

    The query input may be provided as `?projectId=...`; this endpoint stays
    read-only and never accepts a body that flips physical output flags.
    """
    user = _current_user(aeromind_session, authorization)
    project_id = request.query_params.get('projectId') or request.query_params.get('id') or ''
    try:
        with SessionLocal() as db:
            data = labbench_service.gate_state(db, user, str(project_id or ''))
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/gates/hardware-checklist', include_in_schema=False)
async def labbench_gates_hardware_checklist(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.complete_hardware_checklist(db, user, str(payload.get('projectId') or ''), payload)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/gates/arm-n3', include_in_schema=False)
async def labbench_gates_arm_n3(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.arm_n3_gate(db, user, str(payload.get('projectId') or ''), payload)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/gates/disarm-n3', include_in_schema=False)
async def labbench_gates_disarm_n3(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.disarm_n3_gate(db, user, str(payload.get('projectId') or ''))
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/gates/sign-off-n4', include_in_schema=False)
async def labbench_gates_sign_off_n4(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.sign_off_n4_gate(db, user, str(payload.get('projectId') or ''), payload)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


# === Multi-drone (fleet) endpoints — LabBench 01 v3 ===

@app.get('/api/labbench/fleet', include_in_schema=False)
def labbench_fleet_get(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Aggregate gate progressions for every drone in a project's fleet."""
    user = _current_user(aeromind_session, authorization)
    project_id = request.query_params.get('projectId') or request.query_params.get('id') or ''
    try:
        with SessionLocal() as db:
            data = labbench_service.fleet_gate_state(db, user, str(project_id or ''))
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.get('/api/labbench/drones/{drone_id}/gate', include_in_schema=False)
def labbench_drone_gate_get(drone_id: str, request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    project_id = request.query_params.get('projectId') or request.query_params.get('id') or ''
    try:
        with SessionLocal() as db:
            data = labbench_service.per_drone_gate_state(db, user, str(project_id or ''), str(drone_id or ''))
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/drones/{drone_id}/hardware-checklist', include_in_schema=False)
async def labbench_drone_hardware_checklist(drone_id: str, request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.complete_hardware_checklist_drone(db, user, str(payload.get('projectId') or ''), str(drone_id or ''), payload)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/drones/{drone_id}/arm-n3', include_in_schema=False)
async def labbench_drone_arm_n3(drone_id: str, request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.arm_n3_gate_drone(db, user, str(payload.get('projectId') or ''), str(drone_id or ''), payload)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/drones/{drone_id}/disarm-n3', include_in_schema=False)
async def labbench_drone_disarm_n3(drone_id: str, request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.disarm_n3_gate_drone(db, user, str(payload.get('projectId') or ''), str(drone_id or ''))
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/labbench/fleet/run-simulation', include_in_schema=False)
async def labbench_fleet_run_simulation(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Run a fleet simulation: one N2 scenario per drone in parallel.

    Body: { projectId: string, scenarios: [{ droneId, ...scenarioInputs }] }
    """
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = labbench_service.run_fleet_simulation(db, user, str(payload.get('projectId') or ''), payload)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


# ===========================================================================
# Phase A-D — Hardware endpoints (MAVLink commands, pool, geofence, gate N4 HW)
#
# All endpoints are dormant unless HARDWARE_CONTROL=true. The contract stays:
# physicalOutputEnabled is the answer of the endpoint, not the request.
# ===========================================================================

@app.get('/api/hardware/status', include_in_schema=False)
def hardware_status():
    """Public status of the hardware subsystem."""
    return {
        'hardwareControlEnabled': mavlink_command_service.hardware_commands_enabled(),
        'allowedCommands': list(mavlink_command_service.ALLOWED_COMMANDS),
        'allowedModes': list(mavlink_command_service.ALLOWED_MODES),
        'maxFleetSize': mavlink_pool_service.MAX_POOL_SIZE,
        'poolSize': mavlink_pool_service.get_pool().size(),
        'physicalOutputEnabled': False,
        'physicalCommandsEmitted': False,
    }


@app.get('/api/hardware/pool', include_in_schema=False)
def hardware_pool_list(aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """List all drones registered in the MAVLink pool."""
    _user = _current_user(aeromind_session, authorization)
    if not _user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    pool = mavlink_pool_service.get_pool()
    return JSONResponse({'drones': pool.list()}, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/hardware/pool/register', include_in_schema=False)
async def hardware_pool_register(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    drone_id = str(payload.get('droneId') or '').strip()
    drone_name = str(payload.get('droneName') or drone_id).strip()
    connection_url = str(payload.get('connectionUrl') or '').strip()
    project_id = str(payload.get('projectId') or '').strip()
    if not drone_id or not connection_url:
        return _trpc_error(400, 'BAD_REQUEST', 'droneId and connectionUrl are required')
    try:
        pool = mavlink_pool_service.get_pool()
        # P0-03 fix (INSPECT-BACKEND B-CRIT-04): pass owner_id and project_id
        # to satisfy SEC-02 tenant isolation. Without these, MavlinkPool.register
        # raised HardwareCommandError(400, "BAD_REQUEST", "owner_id et project_id
        # sont requis (SEC-02 isolation inter-tenant)") on every call.
        entry = pool.register(
            drone_id, drone_name, connection_url,
            owner_id=user['id'],
            project_id=project_id or '',
        )
        # Mark the drone as registered in the hardware gate state.
        if project_id:
            with SessionLocal() as db:
                row, data, _ = hardware_gate_service._ensure_hardware_gate_state(db, _require_project(db, user['id'], project_id), user)
                data.setdefault('conditions', {})['drone_registered_in_pool'] = True
                data['updatedAt'] = datetime.now(UTC).isoformat()
                row.data_json = _json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                db.commit()
        return JSONResponse({
            'droneId': entry.drone_id,
            'droneName': entry.drone_name,
            'connectionUrl': entry.connection_url,
            'registeredAt': entry.registered_at,
            'hardwareControlEnabled': mavlink_command_service.hardware_commands_enabled(),
        }, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})
    except mavlink_command_service.HardwareCommandError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)


@app.post('/api/hardware/pool/{drone_id}/unregister', include_in_schema=False)
def hardware_pool_unregister(drone_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    # P0-03 fix (INSPECT-BACKEND B-HIGH-01): pass owner_id to enforce SEC-02
    # tenant isolation on unregister. Without it any authenticated user could
    # unregister another tenant's drone from the pool.
    removed = mavlink_pool_service.get_pool().unregister(drone_id, owner_id=user['id'])
    return JSONResponse({'removed': removed, 'droneId': drone_id})


@app.get('/api/hardware/gate', include_in_schema=False)
def hardware_gate_get(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Hardware N4 gate state for a project."""
    user = _current_user(aeromind_session, authorization)
    project_id = request.query_params.get('projectId') or request.query_params.get('id') or ''
    try:
        with SessionLocal() as db:
            data = hardware_gate_service.hardware_gate_state(db, user, str(project_id or ''))
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/hardware/gate/sign-review', include_in_schema=False)
async def hardware_gate_sign_review(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Sign the independent hardware N4 review (R-01).

    P0-03 fix: extract the reviewer's step-up session from the X-Lab-Session
    header or aeromind_lab_session cookie and pass it to sign_hardware_review.
    The service enforces IAM-03 (reviewer != operator) and role 'approver'.
    """
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    # Extract the reviewer's step-up session (distinct from the operator's primary session)
    try:
        reviewer_session = _verify_lab_session(request)
    except Exception as exc:
        detail = getattr(exc, 'detail', str(exc))
        return _trpc_error(401, 'REVIEWER_SESSION_REQUIRED', f'Session step-up approbateur requise: {detail}')
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            data = hardware_gate_service.sign_hardware_review(
                db, user, str(payload.get('projectId') or ''), payload,
                reviewer_session=reviewer_session,
            )
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/hardware/gate/issue-token', include_in_schema=False)
async def hardware_gate_issue_token(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Issue a single-use hardware confirmation token for one physical command."""
    user = _current_user(aeromind_session, authorization)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        with SessionLocal() as db:
            # P0-03 fix: pass command and params so the token is bound to the
            # intended command (was defaulting to NAV_TAKEOFF, causing
            # TOKEN_COMMAND_MISMATCH on mission upload consume).
            data = hardware_gate_service.issue_hardware_confirmation_token(
                db, user, str(payload.get('projectId') or ''), str(payload.get('droneId') or ''),
                command=str(payload.get('command') or 'NAV_TAKEOFF'),
                params=payload.get('params') if isinstance(payload.get('params'), dict) else None,
            )
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    return JSONResponse(data, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/hardware/drones/{drone_id}/command', include_in_schema=False)
async def hardware_drone_command(drone_id: str, request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Send ONE physical MAVLink command to a drone. Requires:
      - HARDWARE_CONTROL=true
      - command on the allowlist
      - valid single-use confirmation token (issued by /issue-token)
      - geofence validation passes
    """
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    command = str(payload.get('command') or '').strip()
    confirmation_token = str(payload.get('confirmationToken') or '').strip()
    parameters = payload.get('parameters') if isinstance(payload.get('parameters'), dict) else {}
    project_id = str(payload.get('projectId') or '').strip()

    try:
        # Consume the token (single-use)
        confirmation = hardware_gate_service.consume_hardware_confirmation_token(confirmation_token, command)
        if confirmation.drone_id != drone_id:
            return _trpc_error(403, 'TOKEN_DRONE_MISMATCH', 'Le jeton ne correspond pas à ce drone')
        # Get the pilot from the pool
        pool = mavlink_pool_service.get_pool()
        # P0-03 fix (INSPECT-BACKEND B-HIGH-01): pass owner_id so pool.pilot
        # enforces SEC-02 tenant isolation — without it any authenticated user
        # could send physical MAVLink commands to another tenant's drone.
        pilot = pool.pilot(drone_id, owner_id=user['id'])
        # Geofence validation
        geofence = geofence_service.get_geofence(project_id) if project_id else None
        receipt = pilot.send_command(
            command,
            parameters=parameters,
            confirmation_token=confirmation_token,
            geofence_validation=lambda p: geofence_service.validate_command_geofence(p, geofence),
            # P0-03 fix (SEC-01): pass Gate 0/4 context so authorize_physical_command
            # can verify project_id/drone_id/actor_id binding (was omitting them,
            # causing CONTEXT_REQUIRED on every HTTP command).
            project_id=project_id,
            drone_id=drone_id,
            actor_id=user['id'],
        )
        # Audit the command (success or failure)
        with SessionLocal() as db:
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=project_id or None,
                user_id=user['id'],
                actor_role=user.get('role', 'user'),
                event_type='labbench.hardware.command_sent' if receipt.sent_to_hardware else 'labbench.hardware.command_refused',
                message=f"Commande hardware {command} drone {drone_id}: {'envoyée' if receipt.sent_to_hardware else 'refusée'}",
                payload_json=_json.dumps({
                    'scope': 'hardware-command',
                    'droneId': drone_id,
                    'command': command,
                    'sentToHardware': receipt.sent_to_hardware,
                    'accepted': receipt.accepted,
                    'reason': receipt.reason,
                    'receiptId': receipt.receipt_id,
                    'physicalOutputEnabled': receipt.sent_to_hardware,
                    'physicalCommandsEmitted': receipt.sent_to_hardware,
                    'tokenId': confirmation_token[:8] + '…',
                }, ensure_ascii=False, separators=(',', ':')),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
        return JSONResponse({
            'droneId': drone_id,
            'command': command,
            'accepted': receipt.accepted,
            'sentToHardware': receipt.sent_to_hardware,
            'physicalOutputEnabled': receipt.sent_to_hardware,
            'physicalCommandsEmitted': receipt.sent_to_hardware,
            'reason': receipt.reason,
            'receiptId': receipt.receipt_id,
        }, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})
    except mavlink_command_service.HardwareCommandError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)
    except labbench_service.LabBenchError as exc:
        return _trpc_error(exc.status_code, exc.code, exc.message)


@app.post('/api/hardware/emergency-stop', include_in_schema=False)
@_limiter.limit("2/minute")  # P2-12 fix: rate-limit e-stop to prevent coordinated multi-drone abuse
def hardware_emergency_stop(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Broadcast NAV_LAND to every drone in the pool. Single-click e-stop."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    pool = mavlink_pool_service.get_pool()
    def audit_logger(drone_id: str, event_type: str, payload: dict):
        with SessionLocal() as db:
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=None,
                user_id=user['id'],
                actor_role=user.get('role', 'user'),
                event_type=event_type,
                message=f"E-stop déclenché pour drone {drone_id}",
                payload_json=_json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
    # P0-03 fix (SEC-02): scope e-stop to the caller's drones only.
    # Was calling emergency_stop_all without owner_id, which made
    # pool.list() return ALL drones across all tenants.
    result = geofence_service.emergency_stop_all(pool, owner_id=user['id'], audit_logger=audit_logger)
    return JSONResponse(result, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.get('/api/hardware/geofence', include_in_schema=False)
def hardware_geofence_get(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Get the geofence for a project."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    project_id = request.query_params.get('projectId') or ''
    geofence = geofence_service.get_geofence(project_id)
    if geofence is None:
        return JSONResponse({'projectId': project_id, 'configured': False})
    return JSONResponse({
        'projectId': geofence.project_id,
        'configured': True,
        'polygon': geofence.polygon,
        'maxAltitudeM': geofence.max_altitude_m,
        'maxDistanceM': geofence.max_distance_m,
        'homeLat': geofence.home_lat,
        'homeLon': geofence.home_lon,
        'updatedAt': geofence.updated_at,
    })


@app.put('/api/hardware/geofence', include_in_schema=False)
async def hardware_geofence_set(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Set the geofence for a project."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    project_id = str(payload.get('projectId') or '').strip()
    polygon = payload.get('polygon') or []
    if not isinstance(polygon, list):
        return _trpc_error(400, 'BAD_REQUEST', 'polygon must be an array of [lat, lon] pairs')
    try:
        polygon_pairs = [(float(p[0]), float(p[1])) for p in polygon if isinstance(p, (list, tuple)) and len(p) == 2]
    except (TypeError, ValueError):
        return _trpc_error(400, 'BAD_REQUEST', 'polygon values must be numeric')
    if len(polygon_pairs) > 0 and len(polygon_pairs) < 3:
        return _trpc_error(400, 'BAD_REQUEST', 'polygon must have at least 3 points or be empty')
    geofence = geofence_service.Geofence(
        project_id=project_id,
        polygon=polygon_pairs,
        max_altitude_m=float(payload.get('maxAltitudeM') or geofence_service.DEFAULT_MAX_ALTITUDE_M),
        max_distance_m=float(payload.get('maxDistanceM') or geofence_service.DEFAULT_MAX_DISTANCE_M),
        home_lat=payload.get('homeLat'),
        home_lon=payload.get('homeLon'),
    )
    # P0-03 fix (INSPECT-BACKEND B-CRIT-05): pass owner_id (keyword-only) to
    # set_geofence — without it the call raised TypeError on every geofence PUT,
    # and since geofence is fail-closed, no MAVLink command could ever be authorized.
    # P2-validation: cap polygon length (200 points) and maxAltitudeM (EASA Open 120m)
    # and validate home_lat/home_lon ranges for defence-in-depth.
    if len(polygon_pairs) > 200:
        return _trpc_error(400, 'BAD_REQUEST', 'polygon must not exceed 200 points (DoS protection)')
    _max_alt = float(payload.get('maxAltitudeM') or geofence_service.DEFAULT_MAX_ALTITUDE_M)
    if _max_alt > 120.0:
        return _trpc_error(400, 'BAD_REQUEST', 'maxAltitudeM must not exceed 120.0 m (EASA Open category cap)')
    if payload.get('homeLat') is not None:
        _hl = float(payload.get('homeLat'))
        if not (-90.0 <= _hl <= 90.0):
            return _trpc_error(400, 'BAD_REQUEST', 'homeLat must be in [-90, 90]')
    if payload.get('homeLon') is not None:
        _hn = float(payload.get('homeLon'))
        if not (-180.0 <= _hn <= 180.0):
            return _trpc_error(400, 'BAD_REQUEST', 'homeLon must be in [-180, 180]')
    geofence_service.set_geofence(geofence, owner_id=user['id'])
    return JSONResponse({'ok': True, 'projectId': project_id, 'polygonSize': len(polygon_pairs)})


# ===========================================================================
# v7 — Alerts endpoints + map view support
# ===========================================================================

@app.get('/api/hardware/alerts', include_in_schema=False)
def hardware_alerts_list(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """List recent unacknowledged alerts."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    project_id = request.query_params.get('projectId')
    drone_id = request.query_params.get('droneId')
    only_unack = request.query_params.get('all') != 'true'
    with SessionLocal() as db:
        from . import alerts as alert_service
        from .models import AlertEvent
        alerts = alert_service.list_recent_alerts(db, project_id=project_id, drone_id=drone_id, only_unacknowledged=only_unack, limit=100)
    return JSONResponse({'alerts': alerts}, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.post('/api/hardware/alerts/{alert_id}/acknowledge', include_in_schema=False)
def hardware_alerts_acknowledge(alert_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    """Acknowledge an alert (remove from live feed)."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    with SessionLocal() as db:
        from . import alerts as alert_service
        result = alert_service.acknowledge_alert(db, alert_id, user['id'], user.get('email'))
    if result.get('error'):
        return _trpc_error(404, 'NOT_FOUND', result['error'])
    return JSONResponse(result, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.get('/api/hardware/map/tiles-status', include_in_schema=False)
def hardware_map_tiles_status():
    """Public endpoint: indicates whether offline map tiles are configured."""
    offline_url = os.getenv('VITE_OFFLINE_TILE_URL', '').strip()
    return {
        'offlineTilesConfigured': bool(offline_url),
        'tileTemplate': offline_url if offline_url else None,
        'onlineProviders': ['osm', 'esri-world-imagery', 'esri-world-street', 'carto-dark'],
    }


# ===========================================================================
# v9 — Flight history + CSV export
# ===========================================================================

@app.get('/api/flights/history', include_in_schema=False)
def flights_history(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Flight history — list of completed flights (missions uploaded + executed)."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    project_id = request.query_params.get('projectId')
    drone_id = request.query_params.get('droneId')
    minutes = int(request.query_params.get('minutes', '60'))
    if minutes < 1 or minutes > 1440:
        minutes = 60
    from datetime import UTC, datetime, timedelta
    since = datetime.now(UTC) - timedelta(minutes=minutes)
    with SessionLocal() as db:
        from .models import FleetTelemetrySample
        stmt = select(FleetTelemetrySample).where(FleetTelemetrySample.sample_time >= since)
        if drone_id:
            stmt = stmt.where(FleetTelemetrySample.drone_id == drone_id)
        elif project_id:
            stmt = stmt.where(FleetTelemetrySample.project_id == project_id)
        stmt = stmt.order_by(FleetTelemetrySample.sample_time.asc()).limit(5000)
        rows = db.scalars(stmt).all()
        samples = [
            {
                'sampleTime': row.sample_time.astimezone(UTC).isoformat() if row.sample_time.tzinfo else row.sample_time.replace(tzinfo=UTC).isoformat(),
                'droneId': row.drone_id,
                'droneName': row.drone_name,
                'latitude_deg': row.latitude_deg,
                'longitude_deg': row.longitude_deg,
                'altitude_m': row.altitude_m,
                'relative_altitude_m': row.relative_altitude_m,
                'heading_deg': row.heading_deg,
                'battery_remaining_pct': row.battery_remaining_pct,
                'voltage_v': row.voltage_v,
                'current_a': row.current_a,
                'armed': row.armed,
                'connected': row.connected,
                'inside_geofence': row.inside_geofence,
            }
            for row in rows
        ]
    return JSONResponse({'rangeMinutes': minutes, 'totalCount': len(samples), 'samples': samples}, headers={'Cache-Control': 'no-store', 'Vary': 'Cookie'})


@app.get('/api/flights/export.csv', include_in_schema=False)
def flights_export_csv(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Export telemetry samples as CSV (for offline analysis)."""
    user = _current_user(aeromind_session, authorization)
    if not user:
        return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
    project_id = request.query_params.get('projectId')
    drone_id = request.query_params.get('droneId')
    minutes = int(request.query_params.get('minutes', '60'))
    if minutes < 1 or minutes > 1440:
        minutes = 60
    from datetime import UTC, datetime, timedelta
    since = datetime.now(UTC) - timedelta(minutes=minutes)
    with SessionLocal() as db:
        from .models import FleetTelemetrySample
        stmt = select(FleetTelemetrySample).where(FleetTelemetrySample.sample_time >= since)
        if drone_id:
            stmt = stmt.where(FleetTelemetrySample.drone_id == drone_id)
        elif project_id:
            stmt = stmt.where(FleetTelemetrySample.project_id == project_id)
        stmt = stmt.order_by(FleetTelemetrySample.sample_time.asc()).limit(10000)
        rows = db.scalars(stmt).all()
        import csv as csv_mod
        import io
        output = io.StringIO()
        writer = csv_mod.writer(output)
        writer.writerow(['sample_time', 'drone_id', 'drone_name', 'latitude_deg', 'longitude_deg', 'altitude_m', 'relative_altitude_m', 'heading_deg', 'battery_pct', 'voltage_v', 'current_a', 'armed', 'connected', 'inside_geofence'])
        for r in rows:
            writer.writerow([
                r.sample_time.astimezone(UTC).isoformat() if r.sample_time.tzinfo else r.sample_time.replace(tzinfo=UTC).isoformat(),
                r.drone_id,
                r.drone_name,
                r.latitude_deg,
                r.longitude_deg,
                r.altitude_m,
                r.relative_altitude_m,
                r.heading_deg,
                r.battery_remaining_pct,
                r.voltage_v,
                r.current_a,
                int(r.armed),
                int(r.connected),
                int(r.inside_geofence),
            ])
        csv_content = output.getvalue()
    from fastapi.responses import Response
    return Response(
        content=csv_content,
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="aeromind-telemetry-{minutes}min.csv"',
            'Cache-Control': 'no-store',
        },
    )


def _require_project(db, user_id: str, project_id: str) -> Project:
    """Helper for the pool register endpoint."""
    record = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user_id))
    if not record:
        raise HTTPException(404, 'Project not found')
    return record


@app.get('/api/system/status')
def system_status(aeromind_session: str | None = Cookie(default=None, convert_underscores=False), authorization: str | None = Header(default=None)):
    if not _current_user(aeromind_session, authorization):
        raise HTTPException(401, 'OIDC authentication required')
    return _engine_status()


@app.get('/api/safety/check')
def safety_check(aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    if not _current_user(aeromind_session):
        raise HTTPException(401, 'OIDC authentication required')
    result = _engine_status()
    return {'safe': bool(result.get('loaded')) and _active_control_mode() == 'simulation', 'hardware_control': False, 'mode': _active_control_mode(), 'result': result}


@app.post('/api/ops/cfd/prepare')
async def prepare_cfd_case(request: Request, aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    """Prepare an isolated CFD job; never executes a hardware command."""
    if not _current_user(aeromind_session):
        raise HTTPException(401, 'OIDC authentication required')
    payload = await request.json()
    runtime = shutil.which('foamRun') or shutil.which('simpleFoam') or shutil.which('blockMesh')
    job_id = f'CFD-{int(time.time())}'
    if not runtime:
        return {
            'job_id': job_id,
            'status': 'blocked_runtime',
            'runtime_available': False,
            'reason': 'Cas préparé en quarantaine ; runtime OpenFOAM absent sur ce serveur.',
            'hardware_control': False,
            'payload_received': bool(payload),
        }
    return {
        'job_id': job_id,
        'status': 'prepared_isolated',
        'runtime_available': True,
        'runtime': runtime,
        'reason': 'Cas préparé pour exécution isolée ; aucune sortie matérielle.',
        'hardware_control': False,
        'payload_received': bool(payload),
    }


@app.get('/{path:path}', include_in_schema=False)
def frontend_routes(path: str):
    if path.startswith('api/'):
        raise HTTPException(404, 'Not found')
    requested = FRONTEND_DIR / path
    if requested.is_file():
        return FileResponse(requested)
    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)
    raise HTTPException(404, 'Frontend not built')


@app.exception_handler(HTTPException)
async def structured_http_error(request: Request, exc: HTTPException):
    language = locale_from_accept_language(request.headers.get('accept-language'))
    detail = exc.detail
    if isinstance(detail, dict) and {'code', 'message', 'details'} <= set(detail):
        payload = {**detail, 'message': localized_message(detail['message'], language)}
    else:
        payload = {'code': f'HTTP_{exc.status_code}', 'message': localized_message(str(detail), language), 'details': {}}
    return JSONResponse(status_code=exc.status_code, content={'error': payload}, headers={'Cache-Control': 'no-store'})


@app.exception_handler(Exception)
async def safe_error(request: Request, exc: Exception):
    language = locale_from_accept_language(request.headers.get('accept-language'))
    return JSONResponse(status_code=500, content={'error': {'code': 'INTERNAL_ERROR', 'message': localized_message('Internal server error', language), 'details': {'type': type(exc).__name__}}})
