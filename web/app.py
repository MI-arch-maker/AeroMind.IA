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
from .admin import activity as admin_activity, create_account, delete_account, list_accounts, migrate_legacy_registry, reset_local_auth, rotate_authorization_code, update_account, verify_authorization_code
from .app_auth_helpers import current_user as resolve_current_user
from .oidc import _is_microsoft_entra_issuer, _session_token, _verified, router as oidc_router
from .local_auth import router as local_auth_router
from .business_api import router as business_router
from .hardware_api import router as hardware_router
from .operational_state import router as operational_state_router
from . import labbench as labbench_service
from .database import Base, engine, ping_database, SessionLocal
from .models import User, Project, Drone, Simulation, Report, AuditEvent, LabSession
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
app.include_router(local_auth_router)
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
        'superAdmin.deleteAccount', 'superAdmin.rotateAuthorizationCode', 'superAdmin.resetLocalAuth',
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
        if current_user.get('role') == 'visitor':
            return _trpc_error(403, 'FORBIDDEN', 'Le rôle Visiteur ne peut pas créer de projet persistant')
        import json
        project_id, drone_id = str(uuid4()), str(uuid4())
        config = payload.get('config', {}) if isinstance(payload.get('config', {}), dict) else {}
        config = {**config, 'airframe': config.get('airframe') or 'quadcopter', 'motorCount': config.get('motorCount') or 4, 'massKg': config.get('massKg') or 1.2, 'batteryWh': config.get('batteryWh') or 100}
        project_data = {'project': payload.get('project', {}), 'config': config, 'requirements': payload.get('requirements', []), 'runId': payload.get('runId', 'SIM-000')}
        try:
            with SessionLocal() as db:
                if current_user.get('role') == 'demo' and db.scalar(select(Project).where(Project.user_id == current_user['id'])) is not None:
                    return _trpc_error(403, 'DEMO_LIMIT_REACHED', 'Le compte Démo est limité à un projet')
                if db.get(User, current_user['id']) is None:
                    db.add(User(id=current_user['id'], email=current_user['email']))
                    db.flush()
                db.add(Project(id=project_id, user_id=current_user['id'], name=project_data['project'].get('name', 'Nouveau projet'), data_json=json.dumps(project_data), active_drone_id=drone_id))
                # Les modèles utilisent des clés étrangères sans relations ORM explicites :
                # forcer le flush garantit que le projet existe avant son drone associé.
                db.flush()
                db.add(Drone(id=drone_id, user_id=current_user['id'], project_id=project_id, name='Drone par défaut', config_json=json.dumps(project_data['config'])))
                db.commit()
        except Exception as exc:
            # Aucun état local ne doit être présenté comme projet serveur si la
            # transaction échoue. Le détail est journalisé côté Render, tandis
            # que le client reçoit un code stable et actionnable.
            print(f'PROJECT_CREATE_FAILED user={current_user.get("email")} error={type(exc).__name__}: {exc}', flush=True)
            return _trpc_error(503, 'PROJECT_PERSISTENCE_FAILED', 'La base métier ne confirme pas la création du projet. Consultez les logs serveur et réessayez.')
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
        if current_user.get('role') in {'demo', 'visitor'}:
            return _trpc_error(403, 'FORBIDDEN', 'Ce niveau de compte ne peut pas soumettre un rapport officiel')
        import json
        project_id = str(payload.get('id', ''))
        with SessionLocal() as db:
            if db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user['id'])) is None: return _trpc_error(404, 'NOT_FOUND', 'Project not found')
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
            data = [{'id': r.id, 'projectId': r.project_id, **__import__('json').loads(r.data_json or '{}')} for r in db.scalars(query).order_by(Report.created_at.desc()).limit(100)]
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
