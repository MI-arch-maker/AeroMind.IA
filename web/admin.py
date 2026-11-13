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
    public = {key: value for key, value in account.items() if key not in {"authorizationCodeHash", "localEnrollmentCodeHash", "localPasswordHash", "localTotpSecretEnc", "localLoginFailures", "localAuthPendingAt", "localTotpLastCounter", "localAuthGeneration", "localEnrollmentCodeIssuedAtEpoch", "dailyTotpCodeHash"}}
    public["level"] = effective_level(public)
    return public


def effective_level(account: dict[str, Any]) -> str:
    """Resolve governance tier from role; never trust a stored tier alone."""
    if account.get("role") == "super_admin":
        return "L5"
    if account.get("role") == "admin":
        return "L4"
    value = str(account.get("level", "L1"))
    return value if value in {"L1", "L2", "L3"} else "L1"


def _normalized_level(role: str, level: str) -> str:
    if role == "super_admin":
        return "L5"
    if role == "admin":
        return "L4"
    if level in {"L1", "L2", "L3"}:
        return level
    return "L3" if level in {"L4", "L5"} else "L1"


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
    # La sélection primaire provient exclusivement de la configuration/secrets.
    email = next(iter(sorted(emails)), None)
    if not email:
        return None
    return {"id": "primary-super-admin", "name": "Administrateur principal", "email": email,
            "role": "super_admin", "requestedRole": "super_admin", "accountStatus": "active",
            "approvalStatus": "approved", "loginMethod": "microsoft-entra", "createdAt": None,
            "lastSignedIn": None, "createdBy": None, "protected": True, "level": "L5"}


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
            stored.update({"email": primary["email"].casefold(), "role": "super_admin", "requestedRole": "super_admin", "accountStatus": "active", "approvalStatus": "approved", "level": "L5", "protected": True})
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
    account = {**account, "level": effective_level(account)}
    return {**account, "id": subject, "accountId": account.get("id"), "workspaceId": account.get("id"), "email": email.strip().casefold()}


def owner_ids_for_actor(actor: dict[str, Any] | None) -> set[str]:
    """Resolve only canonical and legacy owner keys for the authenticated actor."""
    if not actor:
        return set()
    values = {actor.get("id"), actor.get("accountId"), actor.get("workspaceId"),
              actor.get("workspace_id"), actor.get("subject")}
    return {str(value).strip() for value in values if value and str(value).strip()}


def owner_ids_for_account_id(account_id: str) -> set[str]:
    """Return the stable account id plus any persisted identity subject aliases."""
    account_id = str(account_id or "").strip()
    if not account_id:
        return set()
    aliases = {account_id}
    with SessionLocal() as db:
        row = db.get(AdminAccountRecord, account_id)
        if row is not None:
            account = _record_account(row)
            for key in ("entraSubject", "localSubject"):
                value = str(account.get(key, "")).strip()
                if value:
                    aliases.add(value)
    return aliases


def archive_project_for_superadmin(db: Session, project: Project, actor: dict[str, Any], reason: str,
                                   owner_email: str | None = None) -> dict[str, Any]:
    """Persist a complete project/drone snapshot outside the user workspace.

    The caller must invoke this before deleting the active Project row.  The
    archive has no foreign key to users or projects, so it survives account
    and project deletion and is only exposed through Super-Admin routes.
    """
    from .models import Drone, SuperAdminProjectArchive

    existing = db.scalar(select(SuperAdminProjectArchive).where(
        SuperAdminProjectArchive.original_project_id == project.id,
        SuperAdminProjectArchive.archive_reason == reason,
    ))
    if existing is not None:
        return {"id": existing.id, "projectId": existing.original_project_id, "sha256": existing.sha256}
    drones = []
    for drone in db.scalars(select(Drone).where(
        Drone.user_id == project.user_id,
        (Drone.project_id == project.id) | (Drone.id == project.active_drone_id),
    ).order_by(Drone.id)).all():
        try:
            drone_data = json.loads(drone.config_json or "{}")
        except (TypeError, json.JSONDecodeError):
            drone_data = {}
        drones.append({"id": drone.id, "userId": drone.user_id, "projectId": project.id,
                       "name": drone.name, "data": drone_data})
    try:
        project_data = json.loads(project.data_json or "{}")
    except (TypeError, json.JSONDecodeError):
        project_data = {}
    snapshot = {"format": "aeromind-superadmin-project-archive.v1",
                "project": {"id": project.id, "userId": project.user_id, "name": project.name,
                             "data": project_data, "activeDroneId": project.active_drone_id,
                             "createdAt": project.created_at.isoformat() if project.created_at else None,
                             "updatedAt": project.updated_at.isoformat() if project.updated_at else None},
                "drones": drones, "reason": reason}
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    record = SuperAdminProjectArchive(
        id=str(uuid.uuid4()), original_project_id=project.id, owner_id=project.user_id,
        owner_email=owner_email, project_name=project.name[:200], archive_reason=reason,
        archived_by=str(actor.get("id", "unknown")), sha256=digest, snapshot_json=encoded,
    )
    db.add(record)
    db.add(_event(db, "superadmin.project.archived", actor, project.id,
                  {"archiveId": record.id, "reason": reason, "sha256": digest,
                   "ownerId": project.user_id, "ownerEmail": owner_email}))
    return {"id": record.id, "projectId": project.id, "sha256": digest}


def list_project_archives(limit: int = 250) -> list[dict[str, Any]]:
    from .models import SuperAdminProjectArchive
    limit = max(1, min(int(limit), 500))
    with SessionLocal() as db:
        rows = db.scalars(select(SuperAdminProjectArchive).order_by(
            SuperAdminProjectArchive.archived_at.desc()).limit(limit)).all()
        return [{"id": row.id, "projectId": row.original_project_id, "ownerId": row.owner_id,
                 "ownerEmail": row.owner_email, "projectName": row.project_name,
                 "reason": row.archive_reason, "archivedBy": row.archived_by,
                 "archivedAt": row.archived_at.isoformat() if row.archived_at else None,
                 "sha256": row.sha256} for row in rows]


def delete_project_dependents(db: Session, project_id: str) -> None:
    """Delete project-scoped rows after their immutable archive is written."""
    from sqlalchemy import inspect
    from .canonical_models import (AuditEventExt, DroneRevision, EventOutbox,
                                   GateValidation, GeofenceRecord, HardwareToken,
                                   Measurement, TestRun)
    from .models import (AlertEvent, AuditEvent, BatteryCycle, Drone,
                         EngineeringArtifact, EngineeringDocumentRecord,
                         EngineeringJob, EngineeringSimulationRun,
                         FleetTelemetrySample, InstitutionalCommandRequest,
                         InstitutionalGateEvent, LabSession, MaintenanceRecord,
                         Mission, PreflightChecklist, PrototypeVersion, Report,
                         Simulation, WorkflowRun)
    # Delete children before their project parent.  This explicit order is
    # important on SQLite deployments without reliable FK cascade settings,
    # and keeps the operation deterministic on MySQL/TiDB/PostgreSQL too.
    models = (Measurement, TestRun, DroneRevision, GateValidation, HardwareToken,
              GeofenceRecord, EventOutbox, AuditEventExt, InstitutionalGateEvent,
              EngineeringJob, EngineeringDocumentRecord, WorkflowRun,
              PrototypeVersion, EngineeringSimulationRun,
              InstitutionalCommandRequest, EngineeringArtifact, Report,
              Simulation, LabSession, AuditEvent, AlertEvent,
              FleetTelemetrySample, PreflightChecklist, MaintenanceRecord,
              BatteryCycle, Mission, Drone)
    inspector = inspect(db.bind)
    for model in models:
        if not inspector.has_table(model.__table__.name):
            continue
        for row in db.scalars(select(model).where(model.project_id == project_id)).all():
            db.delete(row)


def bind_entra_identity(email: str, subject: str, tenant_id: str) -> dict[str, Any] | None:
    """Bind an already-approved Entra identity without granting any role.

    The email match is only the provisioning lookup. Once the first validated
    Entra ID token is accepted, the immutable tenant + subject pair is stored
    on the Aeromind account. A later token for a different identity is refused.
    """
    normalized_email = email.strip().casefold()
    subject = subject.strip()
    tenant_id = tenant_id.strip()
    if not normalized_email or not subject or not tenant_id:
        return None
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == normalized_email))
        if row is None:
            primary = _primary_account()
            if primary is None or primary.get("email", "").casefold() != normalized_email:
                return None
            return {**primary, "id": subject, "accountId": primary.get("id"), "email": normalized_email}
        account = _record_account(row)
        if account.get("accountStatus") not in {"active", "evaluation"}:
            return None
        bound_subject = str(account.get("entraSubject", "")).strip()
        bound_tenant = str(account.get("entraTenantId", "")).strip()
        if (bound_subject and bound_subject != subject) or (bound_tenant and bound_tenant != tenant_id):
            return None
        changed = not bound_subject or not bound_tenant
        if changed:
            account.update({"entraSubject": subject, "entraTenantId": tenant_id, "entraIdentityBoundAt": _now()})
            row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
            db.add(_event(db, "account.entra_identity_bound", {"id": account.get("id", "unknown"), "email": normalized_email, "role": account.get("role", "user")}, str(account.get("id", "")), {"tenantId": tenant_id, "subject": subject}))
            db.commit()
        return {**account, "id": subject, "accountId": account.get("id"), "email": normalized_email}


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
    _assert_superadmin_actor(actor)
    day = _utc_day()
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(
            AdminAccountRecord.id == account_id
        ).with_for_update())
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
def consume_daily_totp_code(email: str, code: str) -> bool:
    """Atomically validate and invalidate the current-day LabBench fallback code."""
    if not code or len(code) != 6 or not code.isdigit():
        return False
    normalized = email.strip().casefold()
    if not normalized:
        return False
    with SessionLocal() as db:
        row = db.scalar(select(AdminAccountRecord).where(
            AdminAccountRecord.email == normalized
        ).with_for_update())
        if row is None:
            return False
        account = _record_account(row)
        valid = (account.get("accountStatus") in {"active", "evaluation"}
                 and account.get("dailyTotpCodeDate") == _utc_day()
                 and account.get("dailyTotpCodeHash")
                 and secrets.compare_digest(account["dailyTotpCodeHash"], _code_hash(code)))
        if not valid:
            return False
        account.pop("dailyTotpCodeHash", None)
        account.pop("dailyTotpCodeDate", None)
        account.pop("dailyTotpCodeLast4", None)
        account.pop("dailyTotpCodeIssuedAt", None)
        row.data_json = json.dumps(account, ensure_ascii=False, separators=(",", ":"))
        db.commit()
        return True


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
        "level": _normalized_level(requested_role, level),
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
        if "level" in changes or "role" in changes:
            account["level"] = _normalized_level(account.get("role", "user"), str(changes.get("level", account.get("level", "L1"))))
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
        owner_ids = {account_id}
        for key in ("entraSubject", "localSubject"):
            value = str(account.get(key, "")).strip()
            if value:
                owner_ids.add(value)
        archived_projects = []
        for project in db.scalars(select(Project).where(Project.user_id.in_(owner_ids))).all():
            archived_projects.append(archive_project_for_superadmin(
                db, project, actor, "account_permanently_deleted", account.get("email")))
            delete_project_dependents(db, project.id)
            db.delete(project)
        db.add(_event(db, "account.permanently_deleted", actor, account_id,
                      {"id": account_id, "auditRecordId": tombstone_id, "email": account.get("email"),
                       "role": account.get("role"), "deletedAt": _now(), "deletedBy": actor["id"],
                       "deletionState": "permanently_deleted", "auditRecord": True,
                       "archivedProjectCount": len(archived_projects)}))
        db.delete(row)
        db.commit()
        return {"id": account_id, "deleted": True, "permanentlyDeleted": True, "auditRecordId": tombstone_id,
                "archivedProjectCount": len(archived_projects)}


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
    to ``L5``) and ``accountStatus`` (locked to ``active``). The role remains
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
        if "level" in changes and changes.get("level") != "L5":
            raise ValueError("Le niveau du compte Super-Admin doit rester L5")
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
            account["level"] = "L5"
            applied["level"] = "L5"
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
        owner_ids = {account_id}
        for key in ("entraSubject", "localSubject"):
            value = str(account.get(key, "")).strip()
            if value:
                owner_ids.add(value)
        archived_projects = []
        for project in db.scalars(select(Project).where(Project.user_id.in_(owner_ids))).all():
            archived_projects.append(archive_project_for_superadmin(
                db, project, actor, "superadmin_permanently_deleted", target_email))
            delete_project_dependents(db, project.id)
            db.delete(project)
        db.add(_event(db, "superadmin.account.permanently_deleted", actor, account_id,
                      {"id": account_id, "auditRecordId": tombstone_id, "email": target_email,
                       "role": account.get("role"), "deletedAt": _now(), "deletedBy": actor["id"],
                       "deletionState": "permanently_deleted", "auditRecord": True,
                       "archivedProjectCount": len(archived_projects)}))
        db.delete(row)
        # Remove the deleted email from the runtime Super-Admin allowlist so
        # subsequent role checks (and the dev-login bootstrap) no longer
        # recognise it as Super-Admin.
        remaining = {email for email in current_superadmin_emails() if email != target_email}
        set_runtime_superadmin_emails(remaining)
        db.commit()
        return {"id": account_id, "deleted": True, "permanentlyDeleted": True,
                "auditRecordId": tombstone_id, "archivedProjectCount": len(archived_projects)}


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


_MECHANICAL_PREVIEW_FIELDS = {
    "airframe", "modelType", "designId", "designName", "platformProfile", "wingspan", "chord",
    "fuselageLength", "propDiameter", "motorCount", "fuselageSectionType",
    "mechanicalTwin", "mechanicalTwins", "customSketch", "installedMaterials",
}


def _bounded_json_value(value: Any, depth: int = 0) -> Any:
    """Copy JSON data with conservative depth and collection limits for previews."""
    import math

    if depth > 8:
        return None
    if value is None or isinstance(value, (bool, int, str)):
        return value[:500] if isinstance(value, str) else value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, list):
        return [_bounded_json_value(item, depth + 1) for item in value[:500]]
    if isinstance(value, dict):
        return {str(key)[:100]: _bounded_json_value(item, depth + 1)
                for key, item in list(value.items())[:250]}
    return None


def project_mechanical_preview(project_id: str, *, owner_id: str | set[str] | None = None,
                               actor: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Return a bounded, read-only snapshot for one explicitly requested project."""
    if actor is not None:
        _assert_superadmin_actor(actor)
    project_id = str(project_id or "").strip()
    if not project_id or len(project_id) > 128:
        raise ValueError("Identifiant de projet invalide")
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        owner_ids = ({str(owner_id)} if isinstance(owner_id, str) else {str(value) for value in owner_id}) if owner_id is not None else None
        if project is None or (owner_ids is not None and project.user_id not in owner_ids):
            return None
        try:
            body = json.loads(project.data_json or "{}")
        except (TypeError, json.JSONDecodeError):
            body = {}
        candidate = body.get("config") if isinstance(body, dict) else None
        config = candidate if isinstance(candidate, dict) else {}
        has_geometry = any(key in config for key in _MECHANICAL_PREVIEW_FIELDS)
        if not has_geometry and project.active_drone_id:
            from sqlalchemy import or_
            from .models import Drone

            drone = db.scalar(select(Drone).where(
                Drone.id == project.active_drone_id,
                Drone.user_id == project.user_id,
                or_(Drone.project_id == project.id, Drone.project_id.is_(None)),
            ))
            if drone is not None:
                try:
                    drone_config = json.loads(drone.config_json or "{}")
                    if isinstance(drone_config, dict):
                        config = drone_config
                except (TypeError, json.JSONDecodeError):
                    pass
        preview_config = {
            key: _bounded_json_value(value)
            for key, value in config.items()
            if key in _MECHANICAL_PREVIEW_FIELDS
        }
        encoded = json.dumps(preview_config, ensure_ascii=False, allow_nan=False)
        if len(encoded.encode("utf-8")) > 250_000:
            for key in ("mechanicalTwins", "customSketch", "installedMaterials", "mechanicalTwin"):
                preview_config.pop(key, None)
                encoded = json.dumps(preview_config, ensure_ascii=False, allow_nan=False)
                if len(encoded.encode("utf-8")) <= 250_000:
                    break
        return {
            "projectId": project.id,
            "projectName": project.name,
            "configuration": preview_config,
            "readOnly": True,
            "source": "persisted-project-configuration",
        }


def qualification_activity(actor: dict[str, Any] | None, level: str = "all",
                           limit: int = 100) -> dict[str, Any]:
    """Return minimal audit metadata for L1–L3 accounts, never event payloads."""
    if not actor or str(actor.get("role", "")).casefold() not in {"admin", "super_admin"}:
        raise ValueError("Rôle Admin ou Super-Admin requis")
    level = str(level or "all").upper()
    if level not in {"ALL", "L1", "L2", "L3"}:
        raise ValueError("Le filtre doit être Tous, L1, L2 ou L3")
    limit = max(1, min(int(limit), 250))
    allowed_levels = {"L1", "L2", "L3"} if level == "ALL" else {level}
    from sqlalchemy import inspect
    from .database import engine
    from .models import AuditEvent

    with SessionLocal() as db:
        accounts = [account for account in _all_accounts(db)
                    if effective_level(account) in allowed_levels
                    and account.get("accountStatus") in {"active", "evaluation"}]
        account_by_id = {str(account.get("id")): account for account in accounts if account.get("id")}
        account_ids = list(account_by_id)
        events: list[dict[str, Any]] = []
        if account_ids:
            legacy_rows = db.scalars(
                select(AuditEvent).where(AuditEvent.user_id.in_(account_ids))
                .order_by(AuditEvent.occurred_at.desc()).limit(limit)
            ).all()
            for row in legacy_rows:
                account = account_by_id.get(str(row.user_id))
                if not account:
                    continue
                tier = effective_level(account)
                events.append({
                    "id": row.id, "level": tier,
                    "actor": str(account.get("name") or f"Compte {tier}")[:100],
                    "actorRef": str(row.user_id)[:8], "action": str(row.event_type)[:80],
                    "decision": "logged", "projectId": row.project_id,
                    "occurredAt": row.occurred_at.isoformat() if row.occurred_at else None,
                    "source": "project-audit",
                })
            if inspect(engine).has_table("audit_events_ext"):
                from .canonical_models import AuditEventExt

                canonical_rows = db.scalars(
                    select(AuditEventExt).where(AuditEventExt.actor_id.in_(account_ids))
                    .order_by(AuditEventExt.occurred_at.desc()).limit(limit)
                ).all()
                for row in canonical_rows:
                    account = account_by_id.get(str(row.actor_id))
                    if not account:
                        continue
                    tier = effective_level(account)
                    events.append({
                        "id": row.id, "level": tier,
                        "actor": str(account.get("name") or f"Compte {tier}")[:100],
                        "actorRef": str(row.actor_id)[:8], "action": str(row.action)[:80],
                        "decision": str(row.decision)[:20], "projectId": row.project_id,
                        "occurredAt": row.occurred_at.isoformat() if row.occurred_at else None,
                        "source": "canonical-audit",
                    })
        events.sort(key=lambda item: item.get("occurredAt") or "", reverse=True)
        return {
            "level": "all" if level == "ALL" else level,
            "events": events[:limit],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "payloadsIncluded": False,
            "refreshMode": "periodic",
        }


def activity() -> dict[str, Any]:
    from .models import SuperAdminProjectArchive
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
        project_archives = [{"id": row.id, "projectId": row.original_project_id, "projectName": row.project_name,
                             "ownerId": row.owner_id, "ownerEmail": row.owner_email, "reason": row.archive_reason,
                             "archivedBy": row.archived_by,
                             "archivedAt": row.archived_at.isoformat() if row.archived_at else None,
                             "sha256": row.sha256}
                            for row in db.scalars(select(SuperAdminProjectArchive).order_by(
                                SuperAdminProjectArchive.archived_at.desc()).limit(250)).all()]
    return {"projects": projects, "runs": runs, "projectArchives": project_archives, "events": [], "adminEvents": events[:100],
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
            archive = archive_project_for_superadmin(db, project, actor, "superadmin_project_deleted")
            delete_project_dependents(db, project_id)
            db.delete(project)
            db.add(_event(db, "project.deleted", actor, project_id, {"projectId": project_id}))
            db.commit()
            return {"id": project_id, "deleted": True, "archiveId": archive["id"]}
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


# ─────────────────────────────────────────────────────────────────────────────
# Super-Admin audit log purge (EXIGENCE IAM-05 operational override)
# ─────────────────────────────────────────────────────────────────────────────
# The audit_events_ext table is append-only at the PostgreSQL level via the
# audit_ext_no_update_delete trigger (migrations/2026-10-25_canonical_labbench_schema.sql).
# That trigger exists ONLY on PostgreSQL (the migration's CREATE TRIGGER
# statement uses information_schema.triggers which is PG-specific). In the
# dev SQLite profile the table was created manually without the trigger, so
# DELETE works there. In production (PostgreSQL) the trigger blocks DELETE
# and the database raises:
#   sqlalchemy.exc.OperationalError: (psycopg.errors.RaiseException)
#   audit_events_ext is append-only (EXIGENCE IAM-05): UPDATE and DELETE are forbidden
# We catch that error class and re-raise a clean ValueError so the tRPC
# dispatcher can convert it to an HTTP 409 with a clear message.
APPEND_ONLY_TRIGGER_HINT = "append-only"


def _is_append_only_trigger_error(exc: BaseException) -> bool:
    """Heuristic: detect the PostgreSQL ``audit_ext_no_update_delete`` trigger
    rejection from the SQLAlchemy exception chain.

    The trigger message contains the literal ``append-only`` phrase (see
    migrations/2026-10-25_canonical_labbench_schema.sql line 211). We match
    case-insensitively against the exception string and its ``__cause__`` so
    the helper works for both raw ``OperationalError`` and any DBAPI wrapper
    used by psycopg / psycopg2.
    """
    haystacks = []
    cursor = exc
    seen: set[int] = set()
    while cursor is not None and id(cursor) not in seen:
        seen.add(id(cursor))
        haystacks.append(str(cursor))
        cursor = getattr(cursor, "__cause__", None) or getattr(cursor, "orig", None)
    haystack = "\n".join(haystacks).lower()
    return APPEND_ONLY_TRIGGER_HINT in haystack or "audit_events_ext is append-only" in haystack


def _safe_table_delete(db: Session, model_cls: Any) -> int:
    """DELETE every row of ``model_cls`` from the database.

    Returns the count of deleted rows. If the underlying table is guarded
    by the PostgreSQL append-only trigger (audit_events_ext only), the
    DELETE is rejected by the DB and the transaction is rolled back. In
    that case this function raises a ``ValueError`` that the caller can
    surface as an HTTP 409 — the trigger cannot be bypassed without
    disabling it at the schema level.
    """
    from sqlalchemy.exc import DatabaseError, OperationalError

    try:
        # SQLAlchemy 1.4/2.0 — query.delete() returns the rowcount.
        count = db.query(model_cls).delete(synchronize_session=False)
        db.commit()
        return int(count or 0)
    except (OperationalError, DatabaseError) as exc:
        db.rollback()
        if _is_append_only_trigger_error(exc):
            raise ValueError(
                "Cannot delete from audit_events_ext: append-only trigger is "
                "active (production mode). Use the dev SQLite database for "
                "delete operations, or temporarily disable the trigger."
            ) from exc
        # Re-raise unrelated DB errors (connection lost, check constraint, …).
        raise


def clear_audit_logs(actor: dict[str, Any], scope: str = "all") -> dict[str, Any]:
    """Super-Admin global audit purge — deletes every row from one or more
    audit tables, then records an ``audit_log.cleared`` event in
    ``admin_account_events`` so the purge itself is traceable.

    Parameters
    ----------
    actor
        The authenticated Super-Admin user dict (``role == 'super_admin'``).
    scope
        One of ``"all"``, ``"admin_account_events"``, ``"audit_events_ext"``
        or ``"audit_events"``. ``"all"`` clears all three tables.

    Returns
    -------
    dict
        ``{"cleared": {"admin_account_events": int, "audit_events_ext": int,
        "audit_events": int}}``. Counts are zero for tables outside the
        requested scope, or zero for ``audit_events_ext`` in production
        PostgreSQL deployments where the append-only trigger rejects the
        DELETE (the failure is raised as a ``ValueError`` so the caller
        can convert it to HTTP 409).

    Side effects
    ------------
    After the purge a NEW ``admin_account_event`` row is appended with
    ``event_type='audit_log.cleared'`` and payload
    ``{scope, cleared_by, cleared_at, counts}``. This event survives the
    purge because it is recorded AFTER the deletes.
    """
    from sqlalchemy import inspect as _sa_inspect

    from .canonical_models import AuditEventExt
    from .database import engine as _engine
    from .models import AuditEvent

    _assert_superadmin_actor(actor)
    if scope not in {"all", "admin_account_events", "audit_events_ext", "audit_events"}:
        raise ValueError(
            "Scope inconnu — attendu: all, admin_account_events, audit_events_ext ou audit_events"
        )

    inspector = _sa_inspect(_engine)

    def _has_table(name: str) -> bool:
        try:
            return inspector.has_table(name)
        except Exception:
            return False

    tables_in_scope: list[tuple[str, Any]] = []
    if scope in {"all", "admin_account_events"}:
        tables_in_scope.append(("admin_account_events", AdminAccountEvent))
    if scope in {"all", "audit_events_ext"} and _has_table("audit_events_ext"):
        tables_in_scope.append(("audit_events_ext", AuditEventExt))
    if scope in {"all", "audit_events"} and _has_table("audit_events"):
        tables_in_scope.append(("audit_events", AuditEvent))

    cleared: dict[str, int] = {
        "admin_account_events": 0, "audit_events_ext": 0, "audit_events": 0,
    }
    failed: dict[str, str] = {}

    # Each table gets its own short-lived session so that a trigger-blocked
    # DELETE on audit_events_ext cannot abort the transaction used to clear
    # admin_account_events / audit_events.
    for name, model_cls in tables_in_scope:
        try:
            with SessionLocal() as db:
                cleared[name] = _safe_table_delete(db, model_cls)
        except ValueError as exc:
            # Append-only trigger active — record the reason and continue
            # so the other tables still get cleared.
            failed[name] = str(exc)
            cleared[name] = 0
        except Exception as exc:  # pragma: no cover — defensive
            failed[name] = f"{type(exc).__name__}: {exc}"
            cleared[name] = 0

    # Record the audit_log.cleared event AFTER the purge so it survives.
    payload = {
        "scope": scope,
        "cleared_by": str(actor["id"]),
        "cleared_at": _now(),
        "counts": dict(cleared),
    }
    if failed:
        payload["failures"] = failed
    with SessionLocal() as db:
        db.add(_event(db, "audit_log.cleared", actor, None, payload))
        db.commit()

    # If a hard failure happened on audit_events_ext (the append-only
    # trigger is active), bubble up a clear ValueError so the tRPC layer
    # can convert it to HTTP 409 — but only when that table was in scope
    # AND the caller explicitly targeted it (scope == 'audit_events_ext').
    # For scope == 'all' we keep the partial-success contract: counts
    # reflect what was actually cleared, and the audit_log.cleared event
    # captures the failure detail for triage.
    if scope == "audit_events_ext" and "audit_events_ext" in failed:
        raise ValueError(failed["audit_events_ext"])

    return {"cleared": cleared, "failures": failed}
