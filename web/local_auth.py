"""Alternative local authentication for pre-provisioned AeroMind accounts.

Passwords are PBKDF2-HMAC-SHA256 hashed; TOTP is mandatory. Enrollment requires
an administrator-issued one-time code. This module is not a claim of government
certification; production deployments need TLS, secret management and monitoring.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import struct
import time
from datetime import datetime, timezone
from urllib.parse import quote

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from .admin import _event, _primary_account, account_for_email, account_for_identity
from .config import get_settings
from .database import SessionLocal
from .models import AdminAccountRecord
from .oidc import _b64, _cookie_security, _signed, require_session

router = APIRouter(prefix="/api/auth/local", tags=["local authentication"])
ITERATIONS = 600_000
OTP_STEP = 30
OTP_WINDOW = 1
ENROLLMENT_TTL = 600
INVITATION_TTL = 86_400


class Enrollment(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    enrollment_code: str = Field(min_length=12, max_length=80)
    password: str = Field(min_length=14, max_length=128)


class Confirmation(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    otp: str = Field(pattern=r"^\d{6}$")


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)
    otp: str = Field(pattern=r"^\d{6}$")


def _normalize_email(email: str) -> str:
    return email.strip().casefold()


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    value = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS, dklen=32)
    return "pbkdf2_sha256${}${}${}".format(
        ITERATIONS,
        base64.urlsafe_b64encode(salt).decode().rstrip("="),
        base64.urlsafe_b64encode(value).decode().rstrip("="),
    )


def _verify_password(password: str, encoded: str | None) -> bool:
    try:
        scheme, rounds, salt_text, hash_text = (encoded or "").split("$")
        if scheme != "pbkdf2_sha256" or int(rounds) < 300_000:
            return False
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(hash_text + "=" * (-len(hash_text) % 4))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds), dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        # Keep unknown-user timing similar to password verification.
        hashlib.pbkdf2_hmac("sha256", password.encode(), b"aeromind-dummy-salt", ITERATIONS, dklen=32)
        return False


def _new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _totp_for_counter(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{number:06d}"


def _totp(secret: str, at: int | None = None) -> str:
    timestamp = int(time.time()) if at is None else at
    return _totp_for_counter(secret, timestamp // OTP_STEP)


def _matching_totp_counter(secret: str, supplied: str, last_counter: int = -1) -> int | None:
    current = int(time.time()) // OTP_STEP
    for step in range(-OTP_WINDOW, OTP_WINDOW + 1):
        counter = current + step
        if counter > last_counter and hmac.compare_digest(_totp_for_counter(secret, counter), supplied):
            return counter
    return None


def _verify_totp(secret: str, supplied: str) -> bool:
    return _matching_totp_counter(secret, supplied) is not None


def verify_account_totp(email: str, supplied: str) -> bool:
    """Verify an enrolled authenticator TOTP for a LABBENCH step-up."""
    if not supplied or len(supplied) != 6 or not supplied.isdigit():
        return False
    with SessionLocal() as db:
        row = _row_for_email(db, _normalize_email(email))
        if row is None:
            return False
        stored = _load_record(row)
        try:
            secret = _decrypt_secret(stored.get("localTotpSecretEnc", ""))
        except Exception:
            return False
        return _verify_totp(secret, supplied)


def _encryption_key() -> bytes:
    return hashlib.sha256((get_settings().session_secret + ":aeromind-local-totp:v1").encode()).digest()


def _encrypt_secret(secret: str) -> str:
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(_encryption_key()).encrypt(nonce, secret.encode(), b"aeromind-totp-v1")
    return _b64(nonce + encrypted)


def _decrypt_secret(value: str) -> str:
    raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    return AESGCM(_encryption_key()).decrypt(raw[:12], raw[12:], b"aeromind-totp-v1").decode()


def _row_for_email(db, email: str, lock: bool = False):
    query = select(AdminAccountRecord).where(AdminAccountRecord.email == email)
    if lock:
        query = query.with_for_update()
    return db.scalar(query)


def _load_record(row: AdminAccountRecord) -> dict:
    return json.loads(row.data_json or "{}")


def _check_account(account: dict | None) -> bool:
    return bool(account and account.get("accountStatus") in {"active", "evaluation"})


def _otp_uri(secret: str, email: str) -> str:
    issuer = "AeroMind"
    label = quote(f"{issuer}:{email}", safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"


def _session_response(account: dict) -> JSONResponse:
    subject = f"local:{account['id']}:{int(account.get('localAuthGeneration', 0))}"
    email = _normalize_email(account["email"])
    token = _signed(_b64(f"{subject}|{email}".encode()))
    response = JSONResponse({"authenticated": True, "email": email, "auth_method": "local-password-totp"})
    response.set_cookie("aeromind_session", token, max_age=28_800, **_cookie_security())
    response.headers["Cache-Control"] = "no-store"
    return response


def _audit(db, event: str, account: dict, detail: dict | None = None) -> None:
    db.add(_event(db, event, {"id": account.get("id", "unknown"), "email": account.get("email", ""), "role": account.get("role", "user")}, str(account.get("id", "")), detail or {}))


@router.post("/enroll")
def enroll(body: Enrollment):
    email = _normalize_email(str(body.email))
    account = account_for_email(email)
    code_hash = hashlib.sha256(body.enrollment_code.strip().encode()).hexdigest()
    expected_password = body.password
    if len(expected_password) < 14:
        raise HTTPException(400, "Choisissez une phrase de passe d’au moins 14 caractères.")
    if not _check_account(account):
        raise HTTPException(400, "Invitation ou compte invalide.")
    with SessionLocal() as db:
        row = _row_for_email(db, email, lock=True)
        if row is None:
            # Optional first-admin bootstrap independent of Entra. Operators must
            # inject a long random secret through their deployment secret manager.
            primary = _primary_account()
            bootstrap = get_settings().local_superadmin_bootstrap_code
            bootstrap_hash = hashlib.sha256((bootstrap or "").strip().encode()).hexdigest()
            supplied_hash = hashlib.sha256(body.enrollment_code.strip().encode()).hexdigest()
            if (not primary or primary.get("email", "").casefold() != email
                    or not bootstrap or len(bootstrap) < 32
                    or not hmac.compare_digest(bootstrap_hash, supplied_hash)):
                raise HTTPException(400, "Invitation ou compte invalide.")
            stored = {**primary, "localEnrollmentCodeHash": bootstrap_hash,
                      "localEnrollmentCodeLast4": bootstrap[-4:],
                      "localEnrollmentCodeIssuedAtEpoch": int(time.time()),
                      "localAuthGeneration": 0, "localAuthenticationAvailable": True}
            row = AdminAccountRecord(id=primary["id"], email=email,
                                     data_json=json.dumps(stored, ensure_ascii=False, separators=(",", ":")))
            db.add(row)
        else:
            stored = _load_record(row)
        invite_hash = stored.get("localEnrollmentCodeHash")
        issued = int(stored.get("localEnrollmentCodeIssuedAtEpoch", 0))
        if not invite_hash or not issued or time.time() - issued > INVITATION_TTL or not hmac.compare_digest(invite_hash, code_hash) or stored.get("localAuthEnabled"):
            raise HTTPException(400, "Invitation ou compte invalide.")
        secret = _new_totp_secret()
        stored.update({"localPasswordHash": _password_hash(expected_password), "localTotpSecretEnc": _encrypt_secret(secret), "localAuthPendingAt": int(time.time())})
        row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        _audit(db, "account.local_auth_enrollment_started", stored, {"auth_method": "password+totp"})
        db.commit()
    return {"setup_required": True, "secret": secret, "otpauth_uri": _otp_uri(secret, email), "expires_in": ENROLLMENT_TTL}


@router.post("/enroll/confirm")
def confirm_enrollment(body: Confirmation):
    email = _normalize_email(str(body.email))
    with SessionLocal() as db:
        row = _row_for_email(db, email, lock=True)
        if row is None:
            raise HTTPException(400, "Activation impossible. Recommencez l’inscription avec une invitation valide.")
        stored = _load_record(row)
        started = int(stored.get("localAuthPendingAt", 0))
        try:
            secret = _decrypt_secret(stored.get("localTotpSecretEnc", ""))
        except Exception:
            secret = ""
        otp_counter = _matching_totp_counter(secret, body.otp) if secret else None
        if not _check_account(stored) or stored.get("localAuthEnabled") or not stored.get("localPasswordHash") or not secret or time.time() - started > ENROLLMENT_TTL or otp_counter is None:
            raise HTTPException(400, "Code invalide ou inscription expirée. Vérifiez l’heure de l’appareil et recommencez.")
        stored["localTotpLastCounter"] = otp_counter
        stored.setdefault("localAuthGeneration", 0)
        stored["localAuthEnabled"] = True
        stored["lastSignedIn"] = datetime.now(timezone.utc).isoformat()
        stored.pop("localAuthPendingAt", None)
        stored.pop("localEnrollmentCodeHash", None)
        stored.pop("localEnrollmentCodeIssuedAtEpoch", None)
        _audit(db, "account.local_auth_enabled", stored, {"mfa": "totp"})
        row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        db.commit()
        account = stored
    return _session_response(account)


@router.post("/login")
def login(body: Login, request: Request):
    email = _normalize_email(str(body.email))
    with SessionLocal() as db:
        row = _row_for_email(db, email, lock=True)
        if row is None:
            account = None
            stored = {}
        else:
            stored = _load_record(row)
            account = stored
        now = int(time.time())
        failures = [int(x) for x in stored.get("localLoginFailures", []) if now - int(x) < 900]
        if len(failures) >= 5:
            raise HTTPException(429, "Connexion temporairement bloquée. Réessayez dans 15 minutes.", headers={"Retry-After": "900"})
        valid_password = _verify_password(body.password, stored.get("localPasswordHash"))
        otp_counter = None
        if stored.get("localTotpSecretEnc"):
            try:
                otp_counter = _matching_totp_counter(_decrypt_secret(stored["localTotpSecretEnc"]), body.otp, int(stored.get("localTotpLastCounter", -1)))
            except Exception:
                otp_counter = None
        accepted = _check_account(account) and stored.get("localAuthEnabled") is True and valid_password and otp_counter is not None
        if not accepted:
            if row is not None:
                failures.append(now)
                stored["localLoginFailures"] = failures[-5:]
                row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
                _audit(db, "account.local_auth_failed", stored, {"auth_method": "password+totp", "remote_host": request.client.host if request.client else None})
                db.commit()
            raise HTTPException(401, "Identifiants invalides ou accès local non activé.")
        stored.pop("localLoginFailures", None)
        stored["localTotpLastCounter"] = otp_counter
        stored["lastSignedIn"] = datetime.now(timezone.utc).isoformat()
        row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        _audit(db, "account.local_auth_login", stored, {"auth_method": "password+totp", "client": request.client.host if request.client else None})
        db.commit()
    return _session_response(account)


@router.post("/admin/enrollment-invite")
def issue_superadmin_invite(session_payload: str = Depends(require_session)):
    try:
        raw = base64.urlsafe_b64decode(session_payload + "=" * (-len(session_payload) % 4)).decode()
        subject, email = raw.split("|", 1)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(401, "Session invalide.")
    email = _normalize_email(email)
    account = account_for_identity(email, subject)
    if not account or account.get("role") != "super_admin" or not get_settings().is_superadmin_email(email):
        raise HTTPException(403, "Seul le Super-Admin déjà authentifié peut préparer son accès local.")
    code = f"AER-{secrets.token_urlsafe(24)}"
    with SessionLocal() as db:
        row = _row_for_email(db, email, lock=True)
        if row is None:
            primary = _primary_account()
            if not primary or primary.get("email", "").casefold() != email:
                raise HTTPException(403, "Compte Super-Admin principal introuvable.")
            row = AdminAccountRecord(id=primary["id"], email=email, data_json=json.dumps(primary, ensure_ascii=False, separators=(",", ":")))
            db.add(row)
            stored = primary
        else:
            stored = _load_record(row)
        # Re-authentication via Entra is the recovery factor for the bootstrap Super-Admin.
        # Issuing a fresh invitation revokes any former local password/TOTP pair.
        for key in ("localPasswordHash", "localTotpSecretEnc", "localTotpLastCounter", "localAuthPendingAt", "localLoginFailures"):
            stored.pop(key, None)
        stored["localAuthEnabled"] = False
        stored["localAuthGeneration"] = int(stored.get("localAuthGeneration", 0)) + 1
        stored.update({"localEnrollmentCodeHash": hashlib.sha256(code.encode()).hexdigest(), "localEnrollmentCodeLast4": code[-4:], "localEnrollmentCodeIssuedAtEpoch": int(time.time()), "localAuthenticationAvailable": True, "entraAccountRequired": False, "loginMethod": "entra-or-local-password-totp"})
        row.data_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        _audit(db, "account.local_auth_invite_issued", stored, {"mfa": "totp"})
        db.commit()
    return {"email": email, "localEnrollmentCode": code, "expiresAfter": "24 h; single-use", "previousLocalCredentialsRevoked": True}
