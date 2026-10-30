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

# Runtime override for the Super-Admin email allowlist.
#
# ``Settings.superadmin_email_set`` is computed once at startup from the
# ``AEROMIND_SUPERADMIN_EMAILS`` environment variable. To allow the primary
# Super-Admin identity (email) to be modified or revoked at runtime from the
# admin console, this module-level set takes precedence over the static
# configuration when it is not ``None``. It is updated by
# ``set_runtime_superadmin_emails()`` whenever the Super-Admin account is
# updated or definitively deleted.
_RUNTIME_SUPERADMIN_EMAILS: set[str] | None = None


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
    return {key: value for key, value in account.items() if key not in {"authorizationCodeHash", "localEnrollmentCodeHash", "localPasswordHash", "localTotpSecretEnc", "localLoginFailures", "localAuthPendingAt", "localTotpLastCounter", "localAuthGeneration", "localEnrollmentCodeIssuedAtEpoch", "dailyTotpCodeHash"}}


def _record_account(row: AdminAccountRecord) -> dict[str, Any]:
    return json.loads(row.data_json)


def current_superadmin_emails() -> set[str]:
    """Return the set of lower-cased emails currently treated as Super-Admin.

    The runtime set (``_RUNTIME_SUPERADMIN_EMAILS``) takes precedence over the
    static configuration in ``Settings.superadmin_email_set`` so that the
    Super-Admin email can be modified or revoked at runtime through the admin
    console. The returned set is always a fresh copy: callers may mutate it
    without affecting module state.
    """
    if _RUNTIME_SUPERADMIN_EMAILS is not None:
        return {email for email in _RUNTIME_SUPERADMIN_EMAILS}
    return get_settings().superadmin_email_set


def set_runtime_superadmin_emails(emails: set[str]) -> None:
    """Replace the runtime Super-Admin email allowlist.

    Used by ``update_superadmin_account`` (when the Super-Admin email changes)
    and ``delete_superadmin_account`` (when the Super-Admin is definitively
    deleted) so subsequent role checks and the dev-login flow see the new
    state. The provided set is copied and normalised to lower-case strings.
    """
    global _RUNTIME_SUPERADMIN_EMAILS
    _RUNTIME_SUPERADMIN_EMAILS = {str(email).strip().casefold() for email in emails if str(email).strip()}


def _primary_account() -> dict[str, Any] | None:
    emails = current_superadmin_emails()
    # L'adresse mcgregoralvin14@gmail.com reste conservée comme adresse
    # super-admin par défaut, conformément à la décision explicite de
    # l'utilisateur du 30 octobre 2026, jusqu'à révocation personnelle.
    preferred = "mcgregoralvin14@gmail.com"
    email = preferred if preferred in emails else next(iter(emails), None)
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


def reconcile_primary_identity() -> dict[str, Any] | None:
    """Reconcile legacy demo/dev identities with the configured primary admin.

    This is intentionally limited to known development/demo identities. It does
    not delete projects or user data; it only removes stale account records and
    ensures the configured primary identity is active and Super-Admin.
    """
    settings = get_settings()
    primary = _primary_account()
    if primary is None:
        return None
    legacy_emails = {"demo@example.com", "dev@aeromind.local"} - {primary["email"].casefold()}
    with SessionLocal() as db:
        for legacy in legacy_emails:
            row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == legacy))
            if row is not None:
                db.delete(row)
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == primary["email"].casefold()))
        if row is None:
            row = AdminAccountRecord(id=primary["id"], email=primary["email"].casefold(), data_json=json.dumps(primary, ensure_ascii=False, separators=(",", ":")))
            db.add(row)
        else:
            stored = _record_account(row)
            stored.update({"email": primary["email"].casefold(), "role": "super_admin", "requestedRole": "super_admin", "accountStatus": "active", "approvalStatus": "approved", "level": "L4", "protected": True})
            row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        db.commit()
    return primary


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
    # ``id`` remains the authenticated subject for compatibility with the
    # identity layer; ``accountId`` is the stable owner key used by business
    # data so Entra and local MFA sessions share one isolated workspace.
    return {**account, "id": subject, "accountId": account.get("id"), "email": email.strip().casefold()}


def verify_authorization_code(email: str, code: str) -> bool:
    account = account_for_email(email)
    if not account or account.get("accountStatus") not in {"active", "evaluation"}:
        return False
    expected = account.get("authorizationCodeHash") if account else None
    return bool(expected and code and secrets.compare_digest(expected, _code_hash(code)))


def _utc_day() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def issue_daily_totp_code(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    """Issue a six-digit, server-verified LABBENCH code for the current UTC day.

    This is intentionally separate from the enrolled authenticator secret: the
    Super-Admin may transfer this short-lived daily access code, but the code
    itself is never persisted in clear text and is returned only on issuance.
    """
    day = _utc_day()
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if account.get("accountStatus") not in {"active", "evaluation"}:
            raise ValueError("Le compte doit être actif ou en évaluation")
        code = f"{secrets.randbelow(1_000_000):06d}"
        account.update({
            "dailyTotpCodeHash": _code_hash(code),
            "dailyTotpCodeDate": day,
            "dailyTotpCodeLast4": code[-4:],
            "dailyTotpCodeIssuedAt": _now(),
        })
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, "account.daily_totp_issued", actor, account_id,
                      {"date": day, "codeLast4": code[-4:], "validUntilUtc": f"{day}T23:59:59Z"}))
        db.commit()
        return {**_public_account(account), "dailyTotpCode": code, "dailyTotpCodeDate": day,
                "dailyTotpValidUntilUtc": f"{day}T23:59:59Z"}


def verify_daily_totp_code(email: str, code: str) -> bool:
    """Verify the currently issued daily code without exposing its plaintext."""
    if not code or len(code) != 6 or not code.isdigit():
        return False
    account = account_for_email(email)
    return bool(account and account.get("accountStatus") in {"active", "evaluation"}
                and account.get("dailyTotpCodeDate") == _utc_day()
                and account.get("dailyTotpCodeHash")
                and secrets.compare_digest(account["dailyTotpCodeHash"], _code_hash(code)))


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


def _assert_superadmin_actor(actor: dict[str, Any] | None) -> None:
    """Guard: only the authenticated Super-Admin session may invoke the
    Super-Admin override operations. The dispatcher already enforces
    ``current_user['role'] == 'super_admin'``; this is a defence-in-depth
    check that also tolerates direct library callers.
    """
    if not actor or str(actor.get("role", "")).casefold() != "super_admin":
        raise ValueError("Seul le compte Super-Admin authentifié peut exécuter cette action")


def _is_superadmin_account(account: dict[str, Any]) -> bool:
    """Return ``True`` when the supplied record represents a Super-Admin
    identity (either through the ``role`` flag or membership in the runtime
    Super-Admin email allowlist).
    """
    return bool(account.get("role") == "super_admin"
                or account.get("email", "").casefold() in current_superadmin_emails())


def update_superadmin_account(actor: dict[str, Any], account_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    """Modify the Super-Admin account from the admin console.

    Overrides the regular ``update_account`` security restriction. The actor
    must be ``super_admin`` (enforced by the dispatcher and re-checked here as
    defence-in-depth). Allowed changes: ``email``, ``name``, ``level`` (locked
    to ``L4``) and ``accountStatus`` (locked to ``active``). The role remains
    ``super_admin`` and cannot be changed. When the email changes, the new
    address is also written into the in-memory Super-Admin allowlist via
    ``set_runtime_superadmin_emails`` so subsequent role checks and the
    dev-login flow see the new identity.

    Audit event: ``superadmin.account.updated``.
    """
    _assert_superadmin_actor(actor)
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if not _is_superadmin_account(account):
            raise ValueError("Ce compte n'est pas un compte Super-Admin")
        # Role is locked to ``super_admin``: a no-op value is tolerated, any
        # other value is rejected so the caller cannot demote the account.
        if "role" in changes and changes.get("role") != "super_admin":
            raise ValueError("Le rôle Super-Admin ne peut pas être modifié")
        if "level" in changes and changes.get("level") != "L4":
            raise ValueError("Le niveau du compte Super-Admin doit rester L4")
        if "accountStatus" in changes and changes.get("accountStatus") != "active":
            raise ValueError("Le statut du compte Super-Admin doit rester actif")

        applied: dict[str, Any] = {}
        old_email = account.get("email", "").casefold()
        new_email: str | None = None
        if "email" in changes and str(changes.get("email", "")).strip():
            candidate = str(changes["email"]).strip().casefold()
            if not candidate or "@" not in candidate:
                raise ValueError("Adresse e-mail invalide")
            if candidate != old_email:
                existing = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == candidate))
                if existing is not None and existing.id != account_id:
                    raise ValueError("Un compte ou une demande existe déjà pour cet e-mail")
                new_email = candidate
                account["email"] = candidate
                row.email = candidate
                applied["email"] = candidate
        if "name" in changes and str(changes.get("name", "")).strip():
            account["name"] = str(changes["name"]).strip()
            applied["name"] = account["name"]
        if "level" in changes:
            account["level"] = "L4"
            applied["level"] = "L4"
        if "accountStatus" in changes:
            account["accountStatus"] = "active"
            account["approvalStatus"] = "approved"
            applied["accountStatus"] = "active"

        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))

        # Propagate the email change to the in-memory Super-Admin allowlist so
        # the dev-login flow and role checks immediately recognise the new
        # identity without a process restart.
        if new_email is not None:
            updated_set = {email for email in current_superadmin_emails() if email != old_email}
            updated_set.add(new_email)
            set_runtime_superadmin_emails(updated_set)

        db.add(_event(db, "superadmin.account.updated", actor, account_id,
                      {"changes": applied, "role": account.get("role"),
                       "level": account.get("level"),
                       "accountStatus": account.get("accountStatus"),
                       "emailRotated": new_email is not None,
                       "previousEmail": old_email if new_email is not None else None}))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ValueError("Un compte ou une demande existe déjà pour cet e-mail") from exc
        return _public_account(account)


def delete_superadmin_account(actor: dict[str, Any], account_id: str, permanent: bool = False) -> dict[str, Any]:
    """Soft-delete or definitively delete the Super-Admin account.

    Overrides the regular ``delete_account`` security restriction. The actor
    must be ``super_admin`` (enforced by the dispatcher and re-checked here).
    When ``permanent=False`` the account is placed in compliance alert:
    ``accountStatus`` becomes ``cancelled`` and ``deletionState`` becomes
    ``pending_compliance``. When ``permanent=True`` the account must already
    be ``cancelled`` (soft-deleted); the row is tombstoned (deleted from the
    table) but the audit event ``superadmin.account.permanently_deleted``
    remains durable, and the email is removed from the runtime Super-Admin
    allowlist via ``set_runtime_superadmin_emails``.

    Audit events: ``superadmin.account.deletion_requested`` (soft) and
    ``superadmin.account.permanently_deleted`` (permanent).
    """
    _assert_superadmin_actor(actor)
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if not _is_superadmin_account(account):
            raise ValueError("Ce compte n'est pas un compte Super-Admin")
        target_email = account.get("email", "").casefold()
        if not permanent:
            account.update({"accountStatus": "cancelled", "approvalStatus": "cancelled",
                            "deletionState": "pending_compliance", "deletionRequestedAt": _now(),
                            "deletionRequestedBy": actor["id"]})
            row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
            db.add(_event(db, "superadmin.account.deletion_requested", actor, account_id,
                          {"email": target_email, "role": account.get("role"),
                           "state": "pending_compliance"}))
            db.commit()
            return {"id": account_id, "deleted": False, "pendingCompliance": True,
                    "accountStatus": "cancelled"}
        if account.get("accountStatus") != "cancelled":
            raise ValueError("La suppression définitive exige une première suppression et une mise en conformité")
        tombstone_id = str(uuid.uuid4())
        db.add(_event(db, "superadmin.account.permanently_deleted", actor, account_id,
                      {"id": account_id, "auditRecordId": tombstone_id, "email": target_email,
                       "role": account.get("role"), "deletedAt": _now(), "deletedBy": actor["id"],
                       "deletionState": "permanently_deleted", "auditRecord": True}))
        db.delete(row)
        # Remove the deleted email from the runtime Super-Admin allowlist so
        # subsequent role checks (and the dev-login bootstrap) no longer
        # recognise it as Super-Admin.
        remaining = {email for email in current_superadmin_emails() if email != target_email}
        set_runtime_superadmin_emails(remaining)
        db.commit()
        return {"id": account_id, "deleted": True, "permanentlyDeleted": True,
                "auditRecordId": tombstone_id}


def reset_superadmin_local_auth(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    """Revoke local credentials on the Super-Admin account and issue a fresh
    one-time setup invitation.

    Mirrors ``reset_local_auth`` but lifts the Super-Admin restriction. The
    actor must be ``super_admin``. Audit event:
    ``superadmin.account.local_auth_reset``.
    """
    _assert_superadmin_actor(actor)
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if not _is_superadmin_account(account):
            raise ValueError("Ce compte n'est pas un compte Super-Admin")
        invite = f"AER-{secrets.token_urlsafe(24)}"
        for key in ("localPasswordHash", "localTotpSecretEnc", "localTotpLastCounter",
                    "localAuthPendingAt", "localLoginFailures"):
            account.pop(key, None)
        account.update({"localAuthEnabled": False,
                        "localAuthGeneration": int(account.get("localAuthGeneration", 0)) + 1,
                        "localEnrollmentCodeHash": _code_hash(invite),
                        "localEnrollmentCodeLast4": invite[-4:],
                        "localEnrollmentCodeIssuedAtEpoch": int(datetime.now(timezone.utc).timestamp()),
                        "localAuthenticationAvailable": True,
                        "loginMethod": "entra-or-local-password-totp"})
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, "superadmin.account.local_auth_reset", actor, account_id,
                      {"mfa": "totp", "credentials_revoked": True}))
        db.commit()
        return {**_public_account(account), "localEnrollmentCode": invite}


def rotate_superadmin_authorization_code(actor: dict[str, Any], account_id: str) -> dict[str, Any]:
    """Rotate the authorization code on the Super-Admin account.

    Mirrors ``rotate_authorization_code`` but lifts the Super-Admin restriction.
    The actor must be ``super_admin``. Audit event:
    ``superadmin.account.authorization_code_rotated``.
    """
    _assert_superadmin_actor(actor)
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.id == account_id))
        if row is None:
            raise KeyError("Compte introuvable")
        account = _record_account(row)
        if not _is_superadmin_account(account):
            raise ValueError("Ce compte n'est pas un compte Super-Admin")
        code = _new_authorization_code()
        account.update({"authorizationCodeHash": _code_hash(code),
                        "authorizationCodeLast4": code[-4:],
                        "authorizationCodeIssuedAt": _now()})
        local_enrollment_code = None
        if not account.get("localAuthEnabled"):
            local_enrollment_code = f"AER-{secrets.token_urlsafe(24)}"
            account.update({"localEnrollmentCodeHash": _code_hash(local_enrollment_code),
                            "localEnrollmentCodeLast4": local_enrollment_code[-4:],
                            "localEnrollmentCodeIssuedAtEpoch": int(datetime.now(timezone.utc).timestamp())})
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, "superadmin.account.authorization_code_rotated", actor, account_id,
                      {"authorizationCodeLast4": account["authorizationCodeLast4"]}))
        db.commit()
        result = {**_public_account(account), "authorizationCode": code}
        if local_enrollment_code:
            result["localEnrollmentCode"] = local_enrollment_code
        return result


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
        projects = []
        for p in db.scalars(select(Project).order_by(Project.created_at.desc()).limit(100)).all():
            try:
                project_body = json.loads(p.data_json or "{}")
            except (TypeError, json.JSONDecodeError):
                project_body = {}
            projects.append({"id": p.id, "name": p.name, "userId": p.user_id,
                             "createdAt": p.created_at.isoformat() if p.created_at else None,
                             "controlStatus": project_body.get("adminControl", {}).get("status", "active")})
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
                       "decisions": len(events), "comptes_supprimes_definitivement": len(deleted_accounts),
                       "proprietaires_projets": len({project["userId"] for project in projects}),
                       "projets_isoles": len(projects)}}


def update_project_control(actor: dict[str, Any], project_id: str, action: str) -> dict[str, Any]:
    """Apply an explicit, audited Super-Admin control to one project."""
    from sqlalchemy import inspect

    from .canonical_models import (AuditEventExt, DroneRevision, EventOutbox,
                                   GateValidation, GeofenceRecord, HardwareToken,
                                   Measurement, TestRun)
    from .models import (AlertEvent, AuditEvent, BatteryCycle, Drone, EngineeringDocumentRecord,
                         FleetTelemetrySample, LabSession, MaintenanceRecord, Mission,
                         PreflightChecklist, PrototypeVersion, Report, Simulation,
                         WorkflowRun)
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise KeyError("Projet introuvable")
        body = json.loads(project.data_json or "{}")
        metadata = body.setdefault("adminControl", {})
        if action == "save":
            metadata.update({"status": "saved", "savedAt": _now(), "savedBy": actor["id"]})
            body.setdefault("project", {})["status"] = "saved"
            event_type = "project.saved"
        elif action == "observe":
            metadata.update({"status": "observed", "observedAt": _now(), "observedBy": actor["id"]})
            body.setdefault("project", {})["status"] = "observed"
            event_type = "project.observed"
        elif action == "delete":
            # Explicit cleanup keeps deletion reliable on deployments where
            # database-level ON DELETE CASCADE is not enabled.
            database_inspector = inspect(db.bind)
            for model in (Measurement, TestRun, DroneRevision, GateValidation,
                          HardwareToken, GeofenceRecord, EventOutbox, AuditEventExt,
                          EngineeringDocumentRecord, WorkflowRun, PrototypeVersion,
                          Report, Simulation, LabSession, AuditEvent, AlertEvent,
                          FleetTelemetrySample, PreflightChecklist, MaintenanceRecord,
                          BatteryCycle, Mission, Drone):
                if not database_inspector.has_table(model.__table__.name):
                    continue
                for row in db.scalars(select(model).where(model.project_id == project_id)).all():
                    db.delete(row)
            db.delete(project)
            db.add(_event(db, "project.deleted", actor, project_id, {"projectId": project_id}))
            db.commit()
            return {"id": project_id, "deleted": True}
        else:
            raise ValueError("Action projet inconnue")
        project.data_json = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        db.add(_event(db, event_type, actor, project_id, {"projectId": project_id, "status": metadata.get("status")}))
        db.commit()
        return {"id": project_id, "projectStatus": metadata.get("status"), "updatedAt": _now()}


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
