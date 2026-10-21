import hashlib
import json
import secrets
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from .config import get_settings

_LOCK = threading.RLock()
_DATA_DIR = Path('data')
_ACCOUNTS_FILE = _DATA_DIR / 'accounts.json'
_EVENTS_FILE = _DATA_DIR / 'admin_events.json'
_DELETED_ACCOUNTS_FILE = _DATA_DIR / 'deleted_accounts.json'
ROLES = {'user', 'demo', 'visitor', 'surveillant', 'admin'}
STATUSES = {'active', 'evaluation', 'suspended', 'cancelled'}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load(path: Path, default: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, list) else default
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default.copy()


def _save(path: Path, value: list[dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def _event(event_type: str, actor: dict[str, Any], target_id: str | None, payload: dict[str, Any]) -> dict[str, Any]:
    return {'id': str(uuid.uuid4()), 'eventType': event_type, 'actorId': actor['id'], 'actorEmail': actor['email'], 'targetUserId': target_id, 'payloadJson': json.dumps(payload, ensure_ascii=False), 'createdAt': _now()}


def _new_authorization_code() -> str:
    return f"AM-{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}"


def _code_hash(code: str) -> str:
    return hashlib.sha256(code.strip().encode('utf-8')).hexdigest()


def _public_account(account: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in account.items() if key != 'authorizationCodeHash'}


def _accounts_with_primary_admin() -> list[dict[str, Any]]:
    accounts = _load(_ACCOUNTS_FILE, [])
    primary_email = 'mcgregoralvin14@gmail.com' if 'mcgregoralvin14@gmail.com' in get_settings().superadmin_email_set else next(iter(get_settings().superadmin_email_set), None)
    if primary_email and not any(a.get('email', '').casefold() == primary_email.casefold() for a in accounts):
        accounts.insert(0, {'id': 'primary-super-admin', 'name': 'Administrateur principal', 'email': primary_email, 'role': 'super_admin', 'requestedRole': 'super_admin', 'accountStatus': 'active', 'approvalStatus': 'approved', 'loginMethod': 'external-sso', 'createdAt': None, 'lastSignedIn': None, 'createdBy': None, 'protected': True, 'level': 'L4'})
    return accounts


def list_accounts() -> list[dict[str, Any]]:
    with _LOCK:
        return [_public_account(account) for account in _accounts_with_primary_admin()]


def account_for_email(email: str) -> dict[str, Any] | None:
    normalized = email.strip().casefold()
    return next((a for a in _accounts_with_primary_admin() if a.get('email', '').casefold() == normalized), None)


def account_for_identity(email: str, subject: str) -> dict[str, Any] | None:
    account = account_for_email(email)
    if account is None:
        return {'id': subject, 'email': email, 'role': 'user', 'accountStatus': 'active', 'level': 'L1'} if not _ACCOUNTS_FILE.exists() else None
    if account.get('accountStatus') not in {'active', 'evaluation'}:
        return None
    return {**account, 'id': subject, 'email': email}


def verify_authorization_code(email: str, code: str) -> bool:
    account = account_for_email(email)
    if not account or account.get('accountStatus') not in {'active', 'evaluation'}:
        return False
    expected = account.get('authorizationCodeHash')
    return bool(expected and code and secrets.compare_digest(expected, _code_hash(code)))


def activity() -> dict[str, Any]:
    with _LOCK:
        accounts, events = _accounts_with_primary_admin(), _load(_EVENTS_FILE, [])
        deleted_accounts = _load(_DELETED_ACCOUNTS_FILE, [])
        projects, runs = [], []
        try:
            from sqlalchemy import select
            from .database import SessionLocal
            from .models import Project, Simulation
            with SessionLocal() as db:
                projects = [{'id': p.id, 'name': p.name, 'userId': p.user_id, 'createdAt': p.created_at.isoformat() if p.created_at else None} for p in db.scalars(select(Project).order_by(Project.created_at.desc()).limit(100))]
                runs = [{'id': r.id, 'projectId': r.project_id, 'createdAt': r.created_at.isoformat() if r.created_at else None} for r in db.scalars(select(Simulation).order_by(Simulation.created_at.desc()).limit(100))]
        except Exception:
            # La console reste utilisable même si la base n'est pas encore initialisée.
            projects, runs = [], []
        return {'projects': projects, 'runs': runs, 'events': [], 'adminEvents': list(reversed(events[-100:])), 'deletedAccounts': list(reversed(deleted_accounts[-100:])), 'totals': {'comptes': len(accounts), 'en_attente': sum(a.get('accountStatus') == 'evaluation' for a in accounts), 'actifs': sum(a.get('accountStatus') == 'active' for a in accounts), 'suspendus': sum(a.get('accountStatus') == 'suspended' for a in accounts), 'administrateurs': sum(a.get('role') in {'admin', 'super_admin'} for a in accounts), 'decisions': len(events), 'comptes_supprimes_definitivement': len(deleted_accounts)}}


def create_account(actor: dict[str, Any], email: str, name: str, requested_role: str = 'user', level: str = 'L1') -> dict[str, Any]:
    email = email.strip().casefold(); requested_role = requested_role if requested_role in ROLES else 'user'
    if not email or '@' not in email or not name.strip(): raise ValueError('Nom et adresse e-mail valides requis')
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, [])
        if any(a.get('email', '').casefold() == email and a.get('accountStatus') != 'cancelled' for a in accounts): raise ValueError('Un compte ou une demande existe déjà pour cet e-mail')
        code = _new_authorization_code()
        account = {'id': str(uuid.uuid4()), 'name': name.strip(), 'email': email, 'role': requested_role, 'requestedRole': requested_role, 'accountStatus': 'active', 'approvalStatus': 'approved', 'loginMethod': 'pending-external-sso', 'createdAt': _now(), 'lastSignedIn': None, 'createdBy': actor['id'], 'level': level if level in {'L1', 'L2', 'L3', 'L4'} else 'L1', 'authorizationCodeHash': _code_hash(code), 'authorizationCodeLast4': code[-4:], 'authorizationCodeIssuedAt': _now()}
        accounts.append(account); events = _load(_EVENTS_FILE, []); events.append(_event('account.created', actor, account['id'], {'email': email, 'role': requested_role, 'level': account['level'], 'authorizationCodeLast4': code[-4:]})); _save(_ACCOUNTS_FILE, accounts); _save(_EVENTS_FILE, events)
        return {**_public_account(account), 'authorizationCode': code}


def rotate_authorization_code(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, [])
        account = next((item for item in accounts if item.get('id') == account_id), None)
        if not account:
            raise KeyError('Compte introuvable')
        if account.get('role') == 'super_admin' or account.get('email', '').casefold() in get_settings().superadmin_email_set:
            raise ValueError('Le code du Super-Admin principal ne peut pas être régénéré depuis cette action')
        code = _new_authorization_code()
        account.update({'authorizationCodeHash': _code_hash(code), 'authorizationCodeLast4': code[-4:], 'authorizationCodeIssuedAt': _now()})
        events = _load(_EVENTS_FILE, [])
        events.append(_event('account.authorization_code_rotated', actor, account_id, {'authorizationCodeLast4': code[-4:]}))
        _save(_ACCOUNTS_FILE, accounts); _save(_EVENTS_FILE, events)
        return {**_public_account(account), 'authorizationCode': code}


def update_account(actor: dict[str, Any], account_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, []); account = next((item for item in accounts if item.get('id') == account_id), None)
        if not account: raise KeyError('Compte introuvable')
        if account.get('role') == 'super_admin' or account.get('email', '').casefold() in get_settings().superadmin_email_set: raise ValueError('Le compte Super-Admin principal ne peut pas être modifié')
        if changes.get('role') in ROLES: account['role'] = account['requestedRole'] = changes['role']
        if changes.get('level') in {'L1', 'L2', 'L3', 'L4'}: account['level'] = changes['level']
        if changes.get('accountStatus') in STATUSES: account['accountStatus'] = changes['accountStatus']; account['approvalStatus'] = 'approved' if changes['accountStatus'] == 'active' else changes['accountStatus']
        if changes.get('decision') == 'approve_creation': account['accountStatus'] = 'active'; account['approvalStatus'] = 'approved'
        if changes.get('decision') == 'evaluate': account['accountStatus'] = 'evaluation'; account['approvalStatus'] = 'evaluation'
        events = _load(_EVENTS_FILE, []); events.append(_event('account.updated', actor, account_id, {'changes': changes, 'role': account.get('role'), 'level': account.get('level'), 'accountStatus': account.get('accountStatus')})); _save(_ACCOUNTS_FILE, accounts); _save(_EVENTS_FILE, events)
        return account


def delete_account(actor: dict[str, Any], account_id: str, permanent: bool = False) -> dict[str, Any]:
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, []); account = next((item for item in accounts if item.get('id') == account_id), None)
        if not account: raise KeyError('Compte introuvable')
        if account.get('role') == 'super_admin' or account.get('email', '').casefold() in get_settings().superadmin_email_set: raise ValueError('Le compte Super-Admin principal ne peut pas être supprimé')
        events = _load(_EVENTS_FILE, [])
        if not permanent:
            account.update({'accountStatus': 'cancelled', 'approvalStatus': 'cancelled', 'deletionState': 'pending_compliance', 'deletionRequestedAt': _now(), 'deletionRequestedBy': actor['id']})
            events.append(_event('account.deletion_requested', actor, account_id, {'email': account.get('email'), 'role': account.get('role'), 'state': 'pending_compliance'}))
            _save(_ACCOUNTS_FILE, accounts); _save(_EVENTS_FILE, events)
            return {'id': account_id, 'deleted': False, 'pendingCompliance': True, 'accountStatus': 'cancelled'}
        if account.get('accountStatus') != 'cancelled':
            raise ValueError('La suppression définitive exige une première suppression et une mise en conformité')
        tombstone = {**account, 'deletedAt': _now(), 'deletedBy': actor['id'], 'deletionState': 'permanently_deleted'}
        _save(_DELETED_ACCOUNTS_FILE, [*_load(_DELETED_ACCOUNTS_FILE, []), tombstone])
        accounts = [item for item in accounts if item.get('id') != account_id]
        events.append(_event('account.permanently_deleted', actor, account_id, {'email': account.get('email'), 'role': account.get('role'), 'auditRecord': True}))
        _save(_ACCOUNTS_FILE, accounts); _save(_EVENTS_FILE, events)
        return {'id': account_id, 'deleted': True, 'permanentlyDeleted': True, 'auditRecordId': tombstone['id']}
