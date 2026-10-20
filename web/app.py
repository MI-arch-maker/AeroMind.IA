import base64
import os
import shutil
import time
from contextlib import asynccontextmanager
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
from .admin import activity as admin_activity, create_account, delete_account, list_accounts, update_account
from .oidc import _session_token, _verified, router as oidc_router
from .business_api import router as business_router
from .hardware_api import router as hardware_router, _controllers
from .operational_state import router as operational_state_router
from .database import Base, engine, ping_database, SessionLocal
from .models import User, Project, Drone, Simulation, Report, LabSession
from sqlalchemy import select
from uuid import uuid4
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
    yield


settings = get_settings()
app = FastAPI(title='AeroMind AI API', version='2.0.0', docs_url='/docs' if settings.environment != 'production' else None, redoc_url=None, lifespan=lifespan)
_local_workspaces: dict[str, dict] = {}
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.hosts)
if settings.origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'X-Request-ID'])

FRONTEND_DIR = Path('frontend/dist')
FRONTEND_INDEX = FRONTEND_DIR / 'index.html'
if FRONTEND_DIR.is_dir():
    app.mount('/assets', StaticFiles(directory=FRONTEND_DIR / 'assets'), name='frontend-assets')

app.include_router(business_router)
app.include_router(hardware_router)
app.include_router(operational_state_router)
app.include_router(oidc_router)
app.include_router(copilot_router)
app.include_router(engineering_extensions_router)
app.include_router(workflow_router)
app.include_router(command_center_router)
app.include_router(engineering_document_router)
app.include_router(sitl_router)
app.include_router(mavlink_telemetry_router)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    if settings.environment == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
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
        'oidc': 'configured' if settings.oidc else 'not_configured',
    }


@app.get('/api/platform/config.js', include_in_schema=False)
def platform_config():
    """Public, non-secret runtime configuration consumed by the React cockpit."""
    oidc_enabled = bool(settings.oidc)
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


@app.get('/api/local/workspace')
async def get_local_workspace(request: Request):
    """Return the anonymous browser workspace as JSON, never the SPA shell."""
    key = request.headers.get('X-AeroMind-Workspace', 'default')
    return {'workspace': _local_workspaces.get(key), 'source': 'LOCAL'}


@app.put('/api/local/workspace')
async def put_local_workspace(request: Request):
    """Store an explicitly local snapshot; this does not imply server evidence."""
    try:
        body = await request.json()
    except Exception as exc:
        return JSONResponse(status_code=400, content={'error': {'code': 'INVALID_JSON', 'message': str(exc)}})
    workspace = body.get('workspace') if isinstance(body, dict) else None
    if not isinstance(workspace, dict):
        return JSONResponse(status_code=422, content={'error': {'code': 'INVALID_WORKSPACE', 'message': 'workspace object required'}})
    if workspace.get('physicalOutputEnabled') is not False:
        return JSONResponse(status_code=422, content={'error': {'code': 'PHYSICAL_OUTPUT_FORBIDDEN', 'message': 'physicalOutputEnabled must remain false'}})
    key = request.headers.get('X-AeroMind-Workspace', 'default')
    _local_workspaces[key] = workspace
    return {'ok': True, 'source': 'LOCAL', 'updatedAt': workspace.get('updatedAt')}


def _current_user(aeromind_session: str | None, authorization: str | None = None):
    token = _session_token(aeromind_session, authorization)
    if not token:
        return None
    try:
        verified = _verified(token)
        raw = base64.urlsafe_b64decode(verified + '=' * (-len(verified) % 4)).decode()
        subject, email = raw.split('|', 1)
        return {
            'id': subject,
            'email': email,
            'name': email,
            'role': 'super_admin' if settings.is_superadmin_email(email) else 'user',
        }
    except Exception:
        return None


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
        'superAdmin.deleteAccount',
    )):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        if current_user['role'] != 'super_admin':
            return _trpc_error(403, 'FORBIDDEN', 'Super-Admin permission required')
    payload: dict = {}
    if request.method == 'POST':
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
        data = [{'id': 'entra', 'label': 'Microsoft Entra ID', 'domains': 'Microsoft 365 / Entra', 'note': 'Connexion OIDC sécurisée', 'configured': bool(settings.oidc)}]
    elif name.endswith('ai.status'):
        data = {'available': bool(settings.openai_api_key), 'provider': 'OpenAI-compatible' if settings.openai_api_key else 'local'}
    elif name.endswith('labBench.status'):
        data = {'ready': True, 'mode': 'safe-python'}
    elif name.endswith('superAdmin.accounts'):
        data = list_accounts()
    elif name.endswith('superAdmin.activity'):
        data = admin_activity()
    elif name.endswith('superAdmin.createAccount'):
        try:
            data = create_account(current_user, payload.get('email', ''), payload.get('name', ''), payload.get('role', 'user'))
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
            data = delete_account(current_user, str(payload.get('id', '')))
        except (KeyError, ValueError) as exc:
            return _trpc_error(400, 'BAD_REQUEST', str(exc))
    elif name.endswith('projects.list'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        with SessionLocal() as db:
            data = []
            for record in db.scalars(select(Project).where(Project.user_id == current_user['id']).order_by(Project.created_at.desc())):
                body = __import__('json').loads(record.data_json or '{}')
                data.append({'id': record.id, 'project': body.get('project', {'name': record.name, 'status': 'active', 'version': '1.0'}), 'config': body.get('config', {}), 'requirements': body.get('requirements', []), 'runId': body.get('runId', 'SIM-000')})
    elif name.endswith('projects.create'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        import json
        project_id, drone_id = str(uuid4()), str(uuid4())
        config = payload.get('config', {}) if isinstance(payload.get('config', {}), dict) else {}
        config = {**config, 'airframe': config.get('airframe') or 'quadcopter', 'motorCount': config.get('motorCount') or 4, 'massKg': config.get('massKg') or 1.2, 'batteryWh': config.get('batteryWh') or 100}
        project_data = {'project': payload.get('project', {}), 'config': config, 'requirements': payload.get('requirements', []), 'runId': payload.get('runId', 'SIM-000')}
        with SessionLocal() as db:
            if db.get(User, current_user['id']) is None:
                db.add(User(id=current_user['id'], email=current_user['email']))
                db.flush()
            db.add(Project(id=project_id, user_id=current_user['id'], name=project_data['project'].get('name', 'Nouveau projet'), data_json=json.dumps(project_data), active_drone_id=drone_id))
            db.commit()
            db.add(Drone(id=drone_id, user_id=current_user['id'], project_id=project_id, name='Drone par défaut', config_json=json.dumps(project_data['config'])))
            db.commit()
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
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user['id']))
            if project is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            result = payload.get('result', {})
            record = Simulation(id=str(uuid4()), user_id=current_user['id'], project_id=project_id, data_json=json.dumps({'runId': result.get('runId', 'SIM-001'), 'version': '1.0', 'result': result, 'config': payload.get('config', {})}))
            db.add(record); db.commit(); data = json.loads(record.data_json)
    elif name.endswith('projects.delete'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        project_id = str(payload.get('id', payload) if isinstance(payload, dict) else payload)
        with SessionLocal() as db:
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user['id']))
            if project is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            db.delete(project); db.commit(); data = {'deleted': True}
    elif name.endswith('projects.saveSnapshot'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        import json
        project_id = str(payload.get('id', ''))
        with SessionLocal() as db:
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user['id']))
            if project is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            state = {'project': payload.get('project', {}), 'config': payload.get('config', {}), 'requirements': payload.get('requirements', []), 'runId': payload.get('runId', 'SIM-000')}
            project.name = state['project'].get('name', project.name); project.data_json = json.dumps(state)
            if project.active_drone_id:
                drone = db.get(Drone, project.active_drone_id)
                if drone is not None: drone.config_json = json.dumps(state['config'])
            db.commit(); data = {'id': project_id, **state}
    elif name.endswith('reports.create'):
        if not current_user:
            return _trpc_error(401, 'UNAUTHORIZED', 'OIDC authentication required')
        import json
        project_id = str(payload.get('id', ''))
        with SessionLocal() as db:
            if db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user['id'])) is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
            record = Report(id=str(uuid4()), user_id=current_user['id'], project_id=project_id, data_json=json.dumps(payload)); db.add(record); db.commit(); data = {'id': record.id, **payload}
    elif any(name.endswith(suffix) for suffix in ('designVersions.list', 'auditEvents.list')):
        data = []
    elif name.endswith('labBench.registry'):
        data = {'devices': [], 'drivers': [], 'updatedAt': None}
    else:
        data = None
    # The legacy React client uses the SuperJSON transformer. Its wire format
    # wraps serialized values under `data.json`; returning a plain object here
    # makes the query look unauthenticated even though the OIDC cookie is valid.
    response = JSONResponse([{'result': {'data': {'json': data}}}])
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
    return {'service': 'aeromind-ai', 'version': '2.0.0', 'oidc': bool(settings.oidc), 'llm': bool(settings.openai_api_key), 'sitl': True, 'hardware_control': False, 'mission_upload': False, 'telemetry_write': False}


@app.get('/api/system/status')
def system_status(aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    if not _current_user(aeromind_session):
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
