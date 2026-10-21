"""Persistent AeroMind allowlist for users who authenticate through Microsoft Entra OIDC."""
from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal
from .models import AdminAccountEvent, AdminAccountRecord, Project, Simulation

ROLES = {"user", "demo", "visitor", "surveillant", "admin"}
STATUSES = {"active", "evaluation", "suspended", "cancelled"}
_DATA_DIR = Path("data")
_ACCOUNTS_FILE = _DATA_DIR / "accounts.json"
_EVENTS_FILE = _DATA_DIR / "admin_events.json"
_DELETED_ACCOUNTS_FILE = _DATA_DIR / "deleted_accounts.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load(path: Path, default: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else default.copy()
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default.copy()


def _save(path: Path, value: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _new_authorization_code() -> str:
    return f"AM-{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}"


def _code_hash(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def _public_account(account: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in account.items() if key not in {"authorizationCodeHash", "localEnrollmentCodeHash", "localPasswordHash", "localTotpSecretEnc", "localLoginFailures", "localAuthPendingAt", "localTotpLastCounter", "localAuthGeneration", "localEnrollmentCodeIssuedAtEpoch"}}


def _record_account(row: AdminAccountRecord) -> dict[str, Any]:
    return json.loads(row.data_json)


def _primary_account() -> dict[str, Any] | None:
    settings = get_settings()
    preferred = "mcgregoralvin14@gmail.com"
    email = preferred if preferred in settings.superadmin_email_set else next(iter(settings.superadmin_email_set), None)
    if not email:
        return None
    return {"id": "primary-super-admin", "name": "Administrateur principal", "email": email,
            "role": "super_admin", "requestedRole": "super_admin", "accountStatus": "active",
            "approvalStatus": "approved", "loginMethod": "microsoft-entra", "createdAt": None,
            "lastSignedIn": None, "createdBy": None, "protected": True, "level": "L4"}


def _all_accounts(db: Session) -> list[dict[str, Any]]:
    accounts = [_record_account(row) for row in db.scalars(select(AdminAccountRecord).order_by(AdminAccountRecord.created_at.desc())).all()]
    primary = _primary_account()
    if primary and not any(item.get("email", "").casefold() == primary["email"].casefold() for item in accounts):
        accounts.insert(0, primary)
    return accounts


def _event(db: Session, event_type: str, actor: dict[str, Any], target_id: str | None, payload: dict[str, Any]) -> AdminAccountEvent:
    return AdminAccountEvent(
        id=str(uuid.uuid4()), event_type=event_type, actor_id=str(actor["id"]),
        actor_email=str(actor.get("email", "" )).strip().casefold(), target_user_id=target_id,
        payload_json=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    )


def _event_dict(event: AdminAccountEvent) -> dict[str, Any]:
    return {"id": event.id, "eventType": event.event_type, "actorId": event.actor_id,
            "actorEmail": event.actor_email, "targetUserId": event.target_user_id,
            "payloadJson": event.payload_json,
            "createdAt": event.created_at.isoformat() if event.created_at else None}


def list_accounts() -> list[dict[str, Any]]:
    with SessionLocal() as db:
        return [_public_account(account) for account in _all_accounts(db)]


def account_for_email(email: str) -> dict[str, Any] | None:
    normalized = email.strip().casefold()
    if not normalized:
        return None
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == normalized))
        if row is not None:
            return _record_account(row)
    primary = _primary_account()
    return primary if primary and primary["email"].casefold() == normalized else None


def account_for_identity(email: str, subject: str) -> dict[str, Any] | None:
    # No implicit/development account: every login must match an active allowlist row
    # or the explicitly configured bootstrap Super-Admin and its Entra identity.
    account = account_for_email(email)
    if account is None or account.get("accountStatus") not in {"active", "evaluation"}:
        return None
    return {**account, "id": subject, "email": email.strip().casefold()}


def verify_authorization_code(email: str, code: str) -> bool:
    account = account_for_email(email)
    if not account or account.get("accountStatus") not in {"active", "evaluation"}:
        return False
    expected = account.get("authorizationCodeHash") if account else None
    return bool(expected and code and secrets.compare_digest(expected, _code_hash(code)))


def create_account(actor: dict[str, Any], email: str, name: str, requested_role: str = "user", level: str = "L1") -> dict[str, Any]:
    email = email.strip().casefold()
    requested_role = requested_role if requested_role in ROLES else "user"
    if not email or "@" not in email or not name.strip():
        raise ValueError("Nom et adresse e-mail valides requis")
    code = _new_authorization_code()
    local_enrollment_code = f"AER-{secrets.token_urlsafe(24)}"
    now = _now()
    account = {
        "id": str(uuid.uuid4()), "name": name.strip(), "email": email, "role": requested_role,
        "requestedRole": requested_role, "accountStatus": "active", "approvalStatus": "approved",
        "createdAt": now, "lastSignedIn": None, "createdBy": actor["id"],
        "level": level if level in {"L1", "L2", "L3", "L4"} else "L1",
        "authorizationCodeHash": _code_hash(code), "authorizationCodeLast4": code[-4:],
        "authorizationCodeIssuedAt": now,
        "localEnrollmentCodeHash": _code_hash(local_enrollment_code),
        "localEnrollmentCodeLast4": local_enrollment_code[-4:],
        "localEnrollmentCodeIssuedAtEpoch": int(datetime.now(timezone.utc).timestamp()),
        "localAuthGeneration": 0,
        "localAuthenticationAvailable": True,
        "entraAccountRequired": False,
        "loginMethod": "entra-or-local-password-totp",
    }
    with SessionLocal() as db:
        if account_for_email(email) is not None:
            raise ValueError("Un compte ou une demande existe déjà pour cet e-mail")
        row = AdminAccountRecord(id=account["id"], email=email,
                                 data_json=json.dumps(account, ensure_ascii=False, separators=(",", ":")))
        db.add(row)
        db.add(_event(db, "account.created", actor, account["id"],
                      {"email": email, "role": requested_role, "level": account["level"],
                       "authorizationCodeLast4": account["authorizationCodeLast4"],
                       "entra_account_required": False,
                       "local_authentication_available": True}))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError("Un compte ou une demande existe déjà pour cet e-mail") from exc
    return {**_public_account(account), "authorizationCode": code, "localEnrollmentCode": local_enrollment_code}


def rotate_authorization_code(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if account.get("role") == "super_admin" or account.get("email", "").casefold() in get_settings().superadmin_email_set:
            raise ValueError("Le compte Super-Admin principal ne peut pas être régénéré depuis cette action")
        code = _new_authorization_code()
        account.update({"authorizationCodeHash": _code_hash(code), "authorizationCodeLast4": code[-4:], "authorizationCodeIssuedAt": _now()})
        local_enrollment_code = None
        if not account.get("localAuthEnabled"):
            local_enrollment_code = f"AER-{secrets.token_urlsafe(24)}"
            account.update({"localEnrollmentCodeHash": _code_hash(local_enrollment_code), "localEnrollmentCodeLast4": local_enrollment_code[-4:], "localEnrollmentCodeIssuedAtEpoch": int(datetime.now(timezone.utc).timestamp())})
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, "account.authorization_code_rotated", actor, account_id,
                      {"authorizationCodeLast4": account["authorizationCodeLast4"]}))
        db.commit()
        result = {**_public_account(account), "authorizationCode": code}
        if local_enrollment_code:
            result["localEnrollmentCode"] = local_enrollment_code
        return result


def reset_local_auth(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    """Revoke local credentials and issue a fresh one-time setup invitation."""
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if account.get("role") == "super_admin" or account.get("email", "").casefold() in get_settings().superadmin_email_set:
            raise ValueError("Utilisez la procédure sécurisée du Super-Admin authentifié par Entra")
        invite = f"AER-{secrets.token_urlsafe(24)}"
        for key in ("localPasswordHash", "localTotpSecretEnc", "localTotpLastCounter", "localAuthPendingAt", "localLoginFailures"):
            account.pop(key, None)
        account.update({"localAuthEnabled": False, "localAuthGeneration": int(account.get("localAuthGeneration", 0)) + 1, "localEnrollmentCodeHash": _code_hash(invite),
                        "localEnrollmentCodeLast4": invite[-4:], "localEnrollmentCodeIssuedAtEpoch": int(datetime.now(timezone.utc).timestamp()), "localAuthenticationAvailable": True,
                        "loginMethod": "entra-or-local-password-totp"})
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, "account.local_auth_reset", actor, account_id, {"mfa": "totp", "credentials_revoked": True}))
        db.commit()
        return {**_public_account(account), "localEnrollmentCode": invite}


def update_account(actor: dict[str, Any], account_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if account.get("role") == "super_admin" or account.get("email", "").casefold() in get_settings().superadmin_email_set:
            raise ValueError("Le compte Super-Admin principal ne peut pas être modifié")
        if changes.get("role") in ROLES:
            account["role"] = account["requestedRole"] = changes["role"]
        if changes.get("level") in {"L1", "L2", "L3", "L4"}:
            account["level"] = changes["level"]
        if changes.get("accountStatus") in STATUSES:
            account["accountStatus"] = changes["accountStatus"]
            account["approvalStatus"] = "approved" if changes["accountStatus"] == "active" else changes["accountStatus"]
        if changes.get("decision") == "approve_creation":
            account.update({"accountStatus": "active", "approvalStatus": "approved"})
        if changes.get("decision") == "evaluate":
            account.update({"accountStatus": "evaluation", "approvalStatus": "evaluation"})
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, "account.updated", actor, account_id,
                      {"changes": changes, "role": account.get("role"), "level": account.get("level"),
                       "accountStatus": account.get("accountStatus")}))
        db.commit()
        return _public_account(account)


def delete_account(actor: dict[str, Any], account_id: str, permanent: bool = False) -> dict[str, Any]:
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if account.get("role") == "super_admin" or account.get("email", "").casefold() in get_settings().superadmin_email_set:
            raise ValueError("Le compte Super-Admin principal ne peut pas être supprimé")
        if not permanent:
            account.update({"accountStatus": "cancelled", "approvalStatus": "cancelled",
                            "deletionState": "pending_compliance", "deletionRequestedAt": _now(),
                            "deletionRequestedBy": actor["id"]})
            row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
            db.add(_event(db, "account.deletion_requested", actor, account_id,
                          {"email": account.get("email"), "role": account.get("role"), "state": "pending_compliance"}))
            db.commit()
            return {"id": account_id, "deleted": False, "pendingCompliance": True, "accountStatus": "cancelled"}
        if account.get("accountStatus") != "cancelled":
            raise ValueError("La suppression définitive exige une première suppression et une mise en conformité")
        tombstone_id = str(uuid.uuid4())
        db.add(_event(db, "account.permanently_deleted", actor, account_id,
                      {"id": account_id, "auditRecordId": tombstone_id, "email": account.get("email"),
                       "role": account.get("role"), "deletedAt": _now(), "deletedBy": actor["id"],
                       "deletionState": "permanently_deleted", "auditRecord": True}))
        db.delete(row)
        db.commit()
        return {"id": account_id, "deleted": True, "permanentlyDeleted": True, "auditRecordId": tombstone_id}


def activity() -> dict[str, Any]:
    with SessionLocal() as db:
        accounts = _all_accounts(db)
        events = [_event_dict(event) for event in db.scalars(
            select(AdminAccountEvent).order_by(AdminAccountEvent.created_at.desc()).limit(500)
        ).all()]
        deleted_accounts = []
        for event in events:
            if event["eventType"] == "account.permanently_deleted":
                details = json.loads(event["payloadJson"] or "{}")
                deleted_accounts.append({**details, "id": details.get("id", event["targetUserId"]),
                                         "deletedBy": event["actorId"], "deletedAt": event["createdAt"]})
        projects = [{"id": p.id, "name": p.name, "userId": p.user_id,
                     "createdAt": p.created_at.isoformat() if p.created_at else None}
                    for p in db.scalars(select(Project).order_by(Project.created_at.desc()).limit(100)).all()]
        runs = [{"id": r.id, "projectId": r.project_id,
                 "createdAt": r.created_at.isoformat() if r.created_at else None}
                for r in db.scalars(select(Simulation).order_by(Simulation.created_at.desc()).limit(100)).all()]
    return {"projects": projects, "runs": runs, "events": [], "adminEvents": events[:100],
            "deletedAccounts": deleted_accounts[:100],
            "totals": {"comptes": len(accounts),
                       "en_attente": sum(a.get("accountStatus") == "evaluation" for a in accounts),
                       "actifs": sum(a.get("accountStatus") == "active" for a in accounts),
                       "suspendus": sum(a.get("accountStatus") == "suspended" for a in accounts),
                       "administrateurs": sum(a.get("role") in {"admin", "super_admin"} for a in accounts),
                       "decisions": len(events), "comptes_supprimes_definitivement": len(deleted_accounts)}}


def migrate_legacy_registry() -> dict[str, int]:
    """Idempotently import the former JSON registry, then archive it after commit."""
    account_count = event_count = 0
    files_exist = any(path.exists() for path in (_ACCOUNTS_FILE, _EVENTS_FILE, _DELETED_ACCOUNTS_FILE))
    if not files_exist:
        return {"accounts": 0, "events": 0}
    legacy_accounts = _load(_ACCOUNTS_FILE, [])
    legacy_events = _load(_EVENTS_FILE, [])
    legacy_deleted = _load(_DELETED_ACCOUNTS_FILE, [])
    with SessionLocal() as db:
        for account in legacy_accounts:
            if not isinstance(account, dict):
                continue
            email = str(account.get("email", "")).strip().casefold()
            if not email or "@" not in email:
                continue
            exists = db.scalar(select(AdminAccountRecord.id).where(AdminAccountRecord.email == email))
            if exists:
                continue
            imported = {**account, "email": email}
            db.add(AdminAccountRecord(id=str(account.get("id") or uuid.uuid4()), email=email,
                                     data_json=json.dumps(imported, ensure_ascii=False, separators=(",", ":"))))
            account_count += 1
        for event in legacy_events:
            if not isinstance(event, dict) or not event.get("eventType"):
                continue
            event_id = str(event.get("id") or uuid.uuid4())
            if db.get(AdminAccountEvent, event_id):
                continue
            created_at = event.get("createdAt")
            try:
                created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00")) if created_at else datetime.now(timezone.utc)
            except ValueError:
                created = datetime.now(timezone.utc)
            db.add(AdminAccountEvent(id=event_id, event_type=str(event["eventType"]),
                                     actor_id=str(event.get("actorId", "legacy")),
                                     actor_email=str(event.get("actorEmail", "" )).casefold(),
                                     target_user_id=str(event["targetUserId"]) if event.get("targetUserId") else None,
                                     payload_json=str(event.get("payloadJson", "{}")), created_at=created))
            event_count += 1
        for tombstone in legacy_deleted:
            if not isinstance(tombstone, dict):
                continue
            event_id = str(tombstone.get("id") or uuid.uuid4())
            if db.get(AdminAccountEvent, event_id):
                continue
            details = {key: tombstone.get(key) for key in ("email", "role", "deletedAt", "deletedBy", "deletionState")}
            db.add(AdminAccountEvent(id=event_id, event_type="account.permanently_deleted",
                                     actor_id=str(tombstone.get("deletedBy", "legacy")), actor_email="",
                                     target_user_id=str(tombstone.get("id")) if tombstone.get("id") else None,
                                     payload_json=json.dumps(details, ensure_ascii=False),
                                     created_at=datetime.now(timezone.utc)))
            event_count += 1
        db.commit()
    for path in (_ACCOUNTS_FILE, _EVENTS_FILE, _DELETED_ACCOUNTS_FILE):
        if path.exists():
            archived = path.with_suffix(path.suffix + ".migrated")
            if not archived.exists():
                path.replace(archived)
    return {"accounts": account_count, "events": event_count}
