"""AeroMind — Self-registration with super-admin approval (Phase 1 modernization).

This module implements a modern MFA account creation flow:
  1. User self-registers with email + name + password (no code needed)
  2. Account is created with status `pending_approval`
  3. Super-admin sees pending registrations in the admin console
  4. Super-admin approves → enrollment code generated, account status becomes `approved_pending_enrollment`
  5. User completes enrollment by scanning QR code + confirming TOTP
  6. Account is now fully active with per-user RFC-6238 TOTP

This complements (does not replace) the existing super-admin-issued enrollment
flow in local_auth.py. Both flows coexist:
  - Self-registration (this module): user initiates, super-admin approves
  - Admin invite (local_auth.py /enroll): super-admin initiates by issuing a code
"""
from __future__ import annotations

import hashlib
import json
import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from .rate_limit import limiter as _limiter  # P1-01 fix
from pydantic import BaseModel, Field
from sqlalchemy import select

from .admin import _event, _primary_account, account_for_email, account_for_identity
from .app_auth_helpers import current_user_or_401
from .config import get_settings
from .database import SessionLocal
from .local_auth import (
    _normalize_email,
    _password_hash,
    _check_account,
    _audit,
    _row_for_email,
    _load_record,
    _new_totp_secret,
    _encrypt_secret,
    _otp_uri,
    ENROLLMENT_TTL,
    INVITATION_TTL,
)
from .models import AdminAccountRecord
from .oidc import require_session

router = APIRouter(prefix="/api/auth/local", tags=["self-registration"])

# Account statuses for the registration lifecycle
STATUS_PENDING_APPROVAL = "pending_approval"
STATUS_APPROVED_PENDING_ENROLLMENT = "approved_pending_enrollment"
STATUS_REJECTED = "rejected"
STATUS_ACTIVE = "active"


class RegistrationRequest(BaseModel):
    """Self-registration request from a new user."""
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=14, max_length=128)
    requested_role: str = Field(default="user", pattern=r"^(user|designer|analyst|operator|approver|admin)$")


class PendingRegistrationSummary(BaseModel):
    """Summary of a pending registration for the super-admin console."""
    email: str
    name: str
    requested_role: str
    status: str
    created_at: str
    requested_at: str


class ApprovalAction(BaseModel):
    """Super-admin approval or rejection of a pending registration."""
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    action: str = Field(pattern=r"^(approve|reject)$")
    reason: str = Field(default="", max_length=500)


class EnrollmentCompletion(BaseModel):
    """User completes enrollment after approval (scan QR + confirm TOTP)."""
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    enrollment_code: str = Field(min_length=12, max_length=80)
    otp: str = Field(pattern=r"^\d{6}$")


@router.post("/register-request")
def register_request(body: RegistrationRequest):
    """Self-registration: user creates an account request (pending approval).

    No authentication required — this is the entry point for new users.
    The account is created with status `pending_approval` and cannot be used
    until a super-admin approves it.
    """
    email = _normalize_email(str(body.email))
    # Check if account already exists
    existing = account_for_email(email)
    if existing and existing.get("accountStatus") not in {"rejected", "cancelled"}:
        # Don't leak whether the email exists — return generic success
        return {
            "submitted": True,
            "message": "Si cette adresse n'est pas déjà enregistrée, votre demande sera examinée par un super-admin.",
        }

    with SessionLocal() as db:
        row = _row_for_email(db, email, lock=True)
        if row is None:
            # Create new pending account
            account_id = f"pending-{secrets.token_urlsafe(12)}"
            stored = {
                "id": account_id,
                "email": email,
                "name": body.name.strip(),
                "role": body.requested_role,
                "requestedRole": body.requested_role,
                "accountStatus": STATUS_PENDING_APPROVAL,
                "approvalStatus": "pending",
                "loginMethod": "local-password-totp",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "requestedAt": datetime.now(timezone.utc).isoformat(),
                "localPasswordHash": _password_hash(body.password),
                "localAuthEnabled": False,
                "localAuthenticationAvailable": False,
                "entraAccountRequired": False,
                "level": "L1",
                "protected": False,
            }
            row = AdminAccountRecord(
                id=account_id,
                email=email,
                data_json=json.dumps(stored, ensure_ascii=False, separators=(",", ":")),
            )
            db.add(row)
            _audit(db, "account.registration_requested", stored, {
                "requested_role": body.requested_role,
                "auth_method": "self-registration",
            })
            db.commit()
        elif _load_record(row).get("accountStatus") == STATUS_REJECTED:
            # Allow re-registration after rejection
            stored = _load_record(row)
            stored.update({
                "name": body.name.strip(),
                "role": body.requested_role,
                "requestedRole": body.requested_role,
                "accountStatus": STATUS_PENDING_APPROVAL,
                "approvalStatus": "pending",
                "localPasswordHash": _password_hash(body.password),
                "requestedAt": datetime.now(timezone.utc).isoformat(),
            })
            row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
            _audit(db, "account.registration_resubmitted", stored, {
                "requested_role": body.requested_role,
            })
            db.commit()
        else:
            # Account already exists and is not rejected — return generic success
            pass

    return {
        "submitted": True,
        "message": "Si cette adresse n'est pas déjà enregistrée, votre demande sera examinée par un super-admin.",
    }


@router.get("/admin/pending-registrations")
def list_pending_registrations(session_payload: str = Depends(require_session)):
    """List all pending registration requests (super-admin only)."""
    try:
        raw = _decode_session(session_payload)
        subject, email = raw
    except Exception:
        raise HTTPException(401, "Session invalide.")
    email = _normalize_email(email)
    account = account_for_identity(email, subject)
    if not account or account.get("role") != "super_admin":
        raise HTTPException(403, "Réservé au super-admin.")

    pending = []
    with SessionLocal() as db:
        rows = db.scalars(
            select(AdminAccountRecord).order_by(AdminAccountRecord.created_at.desc())
        ).all()
        for row in rows:
            stored = _load_record(row)
            if stored.get("accountStatus") in {STATUS_PENDING_APPROVAL, STATUS_APPROVED_PENDING_ENROLLMENT}:
                pending.append({
                    "email": stored.get("email", row.email),
                    "name": stored.get("name", ""),
                    "requested_role": stored.get("requestedRole", stored.get("role", "user")),
                    "status": stored.get("accountStatus", "unknown"),
                    "created_at": stored.get("createdAt", ""),
                    "requested_at": stored.get("requestedAt", ""),
                    "enrollment_code_issued": stored.get("localEnrollmentCodeIssuedAtEpoch", 0) > 0,
                })
    return {"pending": pending, "count": len(pending)}


@router.post("/admin/approve-registration")
def approve_registration(body: ApprovalAction, session_payload: str = Depends(require_session)):
    """Approve or reject a pending registration (super-admin only).

    On approval:
      - Account status becomes `approved_pending_enrollment`
      - An enrollment code is generated (user uses it to complete TOTP enrollment)
      - The enrollment code is returned to the super-admin who must transmit it to the user

    On rejection:
      - Account status becomes `rejected`
      - The password hash is wiped
    """
    try:
        raw = _decode_session(session_payload)
        subject, email = raw
    except Exception:
        raise HTTPException(401, "Session invalide.")
    admin_email = _normalize_email(email)
    admin_account = account_for_identity(admin_email, subject)
    if not admin_account or admin_account.get("role") != "super_admin":
        raise HTTPException(403, "Réservé au super-admin.")

    target_email = _normalize_email(body.email)
    with SessionLocal() as db:
        row = _row_for_email(db, target_email, lock=True)
        if row is None:
            raise HTTPException(404, "Demande d'inscription introuvable.")
        stored = _load_record(row)
        if stored.get("accountStatus") != STATUS_PENDING_APPROVAL:
            raise HTTPException(400, f"Ce compte n'est pas en attente (statut: {stored.get('accountStatus')}).")

        if body.action == "approve":
            # Generate enrollment code
            code = f"AER-{secrets.token_urlsafe(24)}"
            code_hash = hashlib.sha256(code.encode()).hexdigest()
            stored["localEnrollmentCodeHash"] = code_hash
            stored["localEnrollmentCodeLast4"] = code[-4:]
            stored["localEnrollmentCodeIssuedAtEpoch"] = int(time.time())
            stored["accountStatus"] = STATUS_APPROVED_PENDING_ENROLLMENT
            stored["approvalStatus"] = "approved"
            stored["approvedBy"] = admin_account.get("id", "")
            stored["approvedAt"] = datetime.now(timezone.utc).isoformat()
            stored["localAuthenticationAvailable"] = True
            stored["approvalReason"] = body.reason
            row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
            _audit(db, "account.registration_approved", stored, {
                "approved_by": admin_account.get("email", ""),
                "reason": body.reason,
            })
            db.commit()
            return {
                "approved": True,
                "email": target_email,
                "enrollment_code": code,
                "expires_in": "24 h; single-use",
                "next_step": "L'utilisateur doit compléter l'inscription TOTP avec ce code.",
            }
        else:  # reject
            stored["accountStatus"] = STATUS_REJECTED
            stored["approvalStatus"] = "rejected"
            stored["rejectedBy"] = admin_account.get("id", "")
            stored["rejectedAt"] = datetime.now(timezone.utc).isoformat()
            stored["rejectionReason"] = body.reason
            stored["localPasswordHash"] = ""  # Wipe password on rejection
            stored.pop("localEnrollmentCodeHash", None)
            stored.pop("localEnrollmentCodeIssuedAtEpoch", None)
            row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
            _audit(db, "account.registration_rejected", stored, {
                "rejected_by": admin_account.get("email", ""),
                "reason": body.reason,
            })
            db.commit()
            return {
                "rejected": True,
                "email": target_email,
                "reason": body.reason,
            }


@router.post("/complete-enrollment")
@_limiter.limit("10/minute")
def complete_enrollment(body: EnrollmentCompletion, request: Request):
    """Complete TOTP enrollment after approval.

    This is a two-step process:
      1. User submits email + enrollment_code → gets TOTP secret + QR code URI
      2. User scans QR, enters TOTP code → account becomes fully active

    This endpoint handles step 1. Step 2 uses the existing /enroll/confirm endpoint.
    """
    email = _normalize_email(body.email)
    with SessionLocal() as db:
        row = _row_for_email(db, email, lock=True)
        if row is None:
            raise HTTPException(400, "Compte introuvable ou non approuvé.")
        stored = _load_record(row)
        if stored.get("accountStatus") != STATUS_APPROVED_PENDING_ENROLLMENT:
            raise HTTPException(400, "Ce compte n'a pas été approuvé ou l'inscription est déjà complète.")

        code_hash = hashlib.sha256(body.enrollment_code.strip().encode()).hexdigest()
        invite_hash = stored.get("localEnrollmentCodeHash")
        issued = int(stored.get("localEnrollmentCodeIssuedAtEpoch", 0))
        if not invite_hash or not issued or time.time() - issued > INVITATION_TTL:
            raise HTTPException(400, "Code d'inscription expiré. Contactez le super-admin.")
        import hmac as _hmac
        if not _hmac.compare_digest(invite_hash, code_hash):
            raise HTTPException(400, "Code d'inscription invalide.")

        # Generate TOTP secret
        secret = _new_totp_secret()
        stored["localTotpSecretEnc"] = _encrypt_secret(secret)
        stored["localAuthPendingAt"] = int(time.time())
        row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        _audit(db, "account.enrollment_started", stored, {"auth_method": "password+totp"})
        db.commit()

    return {
        "setup_required": True,
        "secret": secret,
        "otpauth_uri": _otp_uri(secret, email),
        "expires_in": ENROLLMENT_TTL,
        "next_step": "Scannez le QR code avec votre application d'authentification, puis confirmez avec le code à 6 chiffres.",
    }


def _decode_session(session_payload: str) -> tuple[str, str]:
    """Decode the session payload into (subject, email)."""
    import base64
    raw = base64.urlsafe_b64decode(session_payload + "=" * (-len(session_payload) % 4)).decode()
    subject, email = raw.split("|", 1)
    return subject, email
