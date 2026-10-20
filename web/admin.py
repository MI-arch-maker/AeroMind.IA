import json
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
    return {
        'id': str(uuid.uuid4()),
        'eventType': event_type,
        'actorId': actor['id'],
        'actorEmail': actor['email'],
        'targetUserId': target_id,
        'payloadJson': json.dumps(payload, ensure_ascii=False),
        'createdAt': _now(),
    }


def _accounts_with_primary_admin() -> list[dict[str, Any]]:
    accounts = _load(_ACCOUNTS_FILE, [])
    primary_email = next(iter(get_settings().superadmin_email_set), None)
    if primary_email and not any(account.get("email", "").casefold() == primary_email for account in accounts):
        accounts.insert(0, {
            "id": "primary-super-admin",
            "name": "Administrateur principal",
            "email": primary_email,
            "role": "super_admin",
            "requestedRole": "super_admin",
            "accountStatus": "active",
            "approvalStatus": "approved",
            "loginMethod": "external-sso",
            "createdAt": None,
            "lastSignedIn": None,
            "createdBy": None,
            "protected": True,
        })
    return accounts

def list_accounts() -> list[dict[str, Any]]:
    with _LOCK:
        return _accounts_with_primary_admin()


def activity() -> dict[str, Any]:
    with _LOCK:
        accounts = _accounts_with_primary_admin()
        events = _load(_EVENTS_FILE, [])
        return {
            'projects': [],
            'runs': [],
            'events': [],
            'adminEvents': list(reversed(events[-100:])),
            'totals': {
                'comptes': len(accounts),
                'en_attente': sum(account.get('accountStatus') == 'pending' for account in accounts),
                'actifs': sum(account.get('accountStatus') == 'active' for account in accounts),
                'suspendus': sum(account.get('accountStatus') == 'suspended' for account in accounts),
                'administrateurs': sum(account.get('role') in {'admin', 'super_admin'} for account in accounts),
                'decisions': len(events),
            },
        }


def create_account(actor: dict[str, Any], email: str, name: str, requested_role: str = 'user') -> dict[str, Any]:
    email = email.strip().casefold()
    requested_role = requested_role if requested_role in {'user', 'admin'} else 'user'
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, [])
        if any(account.get('email', '').casefold() == email and account.get('accountStatus') != 'cancelled' for account in accounts):
            raise ValueError('Un compte ou une demande existe déjà pour cet e-mail')
        account = {
            'id': str(uuid.uuid4()),
            'name': name.strip(),
            'email': email,
            'role': 'user',
            'requestedRole': requested_role,
            'accountStatus': 'pending',
            'approvalStatus': 'pending_creation',
            'loginMethod': 'pending-external-sso',
            'createdAt': _now(),
            'lastSignedIn': None,
            'createdBy': actor['id'],
        }
        accounts.append(account)
        events = _load(_EVENTS_FILE, [])
        events.append(_event('account.creation_requested', actor, account['id'], {'email': email, 'requestedRole': requested_role}))
        _save(_ACCOUNTS_FILE, accounts)
        _save(_EVENTS_FILE, events)
        return account


def update_account(actor: dict[str, Any], account_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, [])
        account = next((item for item in accounts if item.get('id') == account_id), None)
        if not account:
            raise KeyError('Compte introuvable')
        if account.get('role') == 'super_admin':
            raise ValueError('Le compte Super-Admin principal ne peut pas être modifié depuis cette console')
        event_type = 'account.updated'
        if changes.get('decision') == 'approve_creation':
            account['accountStatus'] = 'active'
            account['approvalStatus'] = 'approved'
            account['role'] = account.get('requestedRole', 'user')
            event_type = 'account.creation_approved'
        elif changes.get('decision') == 'cancel_creation':
            account['accountStatus'] = 'cancelled'
            account['approvalStatus'] = 'cancelled'
            event_type = 'account.creation_cancelled'
        elif changes.get('decision') == 'approve_promotion':
            account['role'] = 'admin'
            account['requestedRole'] = 'admin'
            account['approvalStatus'] = 'approved'
            event_type = 'account.promotion_approved'
        elif changes.get('decision') == 'cancel_promotion':
            account['requestedRole'] = account.get('role', 'user')
            account['approvalStatus'] = 'active'
            event_type = 'account.promotion_cancelled'
        else:
            if changes.get('role') in {'user', 'admin'}:
                account['role'] = changes['role']
                account['requestedRole'] = changes['role']
            if changes.get('accountStatus') in {'active', 'suspended', 'cancelled'}:
                account['accountStatus'] = changes['accountStatus']
                account['approvalStatus'] = 'approved' if changes['accountStatus'] == 'active' else changes['accountStatus']
        events = _load(_EVENTS_FILE, [])
        events.append(_event(event_type, actor, account_id, {'changes': changes, 'role': account.get('role'), 'accountStatus': account.get('accountStatus')}))
        _save(_ACCOUNTS_FILE, accounts)
        _save(_EVENTS_FILE, events)
        return account


def delete_account(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    with _LOCK:
        accounts = _load(_ACCOUNTS_FILE, [])
        account = next((item for item in accounts if item.get('id') == account_id), None)
        if not account:
            raise KeyError('Compte introuvable')
        if account.get('role') == 'super_admin' or account.get('email', '').casefold() in get_settings().superadmin_email_set:
            raise ValueError('Le compte Super-Admin principal ne peut pas être supprimé')
        accounts = [item for item in accounts if item.get('id') != account_id]
        events = _load(_EVENTS_FILE, [])
        events.append(_event('account.deleted', actor, account_id, {'email': account.get('email'), 'role': account.get('role')}))
        _save(_ACCOUNTS_FILE, accounts)
        _save(_EVENTS_FILE, events)
        return {'id': account_id, 'deleted': True}
