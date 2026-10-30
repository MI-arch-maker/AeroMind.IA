import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import quote, urlencode, urlparse

import httpx
import jwt
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse

from .config import get_settings
from .admin import account_for_email, account_for_identity
from .primary_session_store import (
    register_primary_session,
    is_primary_session_active,
    revoke_primary_session,
)

router = APIRouter(prefix='/api/auth/oidc', tags=['authentication'])


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def _signed(value: str) -> str:
    secret = get_settings().session_secret.encode()
    signature = hmac.new(secret, value.encode(), hashlib.sha256).digest()
    return f'{value}.{_b64(signature)}'


def _verified(token: str) -> str:
    value, signature = token.rsplit('.', 1)
    expected = _signed(value).rsplit('.', 1)[1]
    if not hmac.compare_digest(signature, expected):
        raise ValueError('invalid signature')
    return value


def _check_local_generation(verified_value: str) -> None:
    """P1-04 fix — verify localAuthGeneration for local sessions.

    The generation is incremented on reset_local_auth / issue_superadmin_invite.
    Without this check in require_session and current_user, a revoked super-admin
    retains access to all endpoints except /me. This helper extracts the check
    from /api/auth/oidc/me and makes it reusable.
    """
    import base64
    try:
        raw = base64.urlsafe_b64decode(verified_value + '=' * (-len(verified_value) % 4)).decode()
        subject, email = raw.split('|', 1)
    except (ValueError, IndexError, UnicodeDecodeError):
        return  # malformed tokens are rejected by _verified upstream
    if not subject.startswith('local:'):
        return  # OIDC sessions don't have a generation
    try:
        from .admin import account_for_email
        _, local_account_id, generation = subject.split(':', 2)
        persistent = account_for_email(email)
        if persistent is None:
            raise HTTPException(401, 'Compte local introuvable')
        if not (local_account_id == str(persistent.get('id'))
                and persistent.get('localAuthEnabled') is True
                and int(generation) == int(persistent.get('localAuthGeneration', 0))):
            raise HTTPException(401, 'Session locale révoquée ou invalide (P1-04)')
    except (ValueError, TypeError):
        raise HTTPException(401, 'Session locale malformée')


def _session_token(aeromind_session: str | None, authorization: str | None) -> str | None:
    if aeromind_session:
        return aeromind_session
    if authorization and authorization.lower().startswith('bearer '):
        token = authorization[7:].strip()
        return token or None
    return None


def require_session(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
) -> str:
    token = _session_token(aeromind_session, authorization)
    if not token:
        raise HTTPException(401, 'OIDC authentication required')
    try:
        verified = _verified(token)
        _check_local_generation(verified)  # P1-04 fix
        # P2-02/P2-03 fix: check server-side allowlist for revocation/expiry.
        # If the session was revoked via logout, reject even if the HMAC is valid.
        if not is_primary_session_active(token):
            raise HTTPException(401, 'Session révoquée ou expirée (P2-02/P2-03)')
        return verified
    except (ValueError, IndexError):
        raise HTTPException(401, 'Invalid session')


def _settings():
    cfg = get_settings().oidc
    if not cfg:
        raise HTTPException(503, 'OIDC/Entra is not configured')
    if not _is_microsoft_entra_issuer(cfg['issuer']):
        raise HTTPException(503, 'Microsoft Entra OIDC is required for AeroMind user accounts')
    return cfg


def _is_microsoft_entra_issuer(issuer: str) -> bool:
    host = (urlparse(issuer).hostname or '').lower().rstrip('.')
    return host in {'login.microsoftonline.com', 'login.microsoftonline.us', 'login.microsoftonline.de', 'login.chinacloudapi.cn'}


def _identity_email(claims: dict) -> str | None:
    """Microsoft Entra peut exposer l’adresse sous plusieurs claims selon le tenant."""
    candidates = _identity_email_candidates(claims)
    return candidates[0] if candidates else None


def _identity_email_candidates(claims: dict) -> list[str]:
    candidates = []
    for key in ('email', 'preferred_username', 'upn', 'unique_name'):
        value = claims.get(key)
        if isinstance(value, str) and '@' in value:
            normalized = value.strip().casefold()
            if normalized not in candidates:
                candidates.append(normalized)
    return candidates


def _cookie_security() -> dict[str, object]:
    # Le Preview public est HTTPS et embarqué dans un iframe cross-site.
    # Le développement local reste compatible HTTP.
    secure = get_settings().environment != 'development'
    return {'httponly': True, 'secure': secure, 'samesite': 'none' if secure else 'lax', 'path': '/'}


@router.get('/status')
def status():
    cfg = get_settings().oidc
    configured = bool(cfg and _is_microsoft_entra_issuer(cfg['issuer']))
    return {'configured': configured, 'provider': 'entra' if configured else None}


@router.get('/me')
def me(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    token = _session_token(aeromind_session, authorization)
    if not token:
        raise HTTPException(401, 'No authenticated session')
    try:
        verified = _verified(token)
        raw = base64.urlsafe_b64decode(verified + '=' * (-len(verified) % 4)).decode()
        subject, email = raw.split('|', 1)
    except (ValueError, IndexError, UnicodeDecodeError):
        raise HTTPException(401, 'Invalid session')
    account = account_for_identity(email, subject)
    if account is None:
        raise HTTPException(403, 'Compte Entra préexistant absent du registre AeroMind, évalué ou suspendu')
    if subject.startswith('local:'):
        try:
            _, local_account_id, generation = subject.split(':', 2)
            persistent_account = account_for_email(email)
            local_session_valid = (persistent_account is not None and local_account_id == str(persistent_account.get('id')) and persistent_account.get('localAuthEnabled') is True and int(generation) == int(persistent_account.get('localAuthGeneration', 0)))
        except (ValueError, TypeError):
            local_session_valid = False
        if not local_session_valid:
            raise HTTPException(401, 'Session locale révoquée ou invalide')
    role = 'super_admin' if get_settings().is_superadmin_email(email) else account.get('role', 'user')
    return {
        'authenticated': True,
        'subject': subject,
        'email': email,
        'name': account.get('name') or email,
        'role': role,
        'level': account.get('level', 'L1'),
        'account_status': account.get('accountStatus', 'active'),
        'trial_access': get_settings().is_trial_email(email),
    }


@router.api_route('/logout', methods=['GET', 'POST'])
def logout(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """P2-03 fix — server-side session revocation.

    Previously logout only deleted the cookie, leaving the HMAC-signed token
    valid indefinitely. Now we also revoke the session in the server-side
    allowlist so a stolen token cannot be replayed after the legitimate user
    logs out.
    """
    token = _session_token(aeromind_session, authorization)
    if token:
        revoke_primary_session(token)
    response = JSONResponse({'logged_out': True})
    response.delete_cookie('aeromind_session', path='/')
    response.delete_cookie('aeromind_oidc_state', path='/')
    # P-LOGOUT-4 fix: also clear the LABBENCH CSRF cookie so the next session
    # starts clean (otherwise stale CSRF tokens cause 403 on first POST).
    response.delete_cookie('aeromind_lab_csrf', path='/')
    response.delete_cookie('lab_csrf_token', path='/')
    return response


@router.get('/login')
async def login(return_to: str = '/'):
    cfg = _settings()
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
        metadata = (await client.get(f"{cfg['issuer']}/.well-known/openid-configuration")).raise_for_status()
        discovery = metadata.json()
    state = _b64(secrets.token_bytes(32))
    nonce = _b64(secrets.token_bytes(32))
    verifier = _b64(secrets.token_bytes(48))
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    safe_return_to = return_to if return_to.startswith('/') and not return_to.startswith('//') and '\\' not in return_to else '/'
    return_token = _b64(safe_return_to.encode())
    payload = f'{state}.{nonce}.{verifier}.{int(time.time())}.{return_token}'
    token = _signed(_b64(payload.encode()))
    query = urlencode({'client_id': cfg['client_id'], 'redirect_uri': cfg['redirect_uri'], 'response_type': 'code', 'scope': 'openid profile email', 'state': state, 'nonce': nonce, 'code_challenge': challenge, 'code_challenge_method': 'S256'})
    response = RedirectResponse(f"{discovery['authorization_endpoint']}?{query}")
    response.set_cookie('aeromind_oidc_state', token, max_age=600, **_cookie_security())
    return response


@router.get('/callback')
async def callback(code: str, state: str, aeromind_oidc_state: str | None = Cookie(default=None, convert_underscores=False)):
    cfg = _settings()
    if not aeromind_oidc_state:
        raise HTTPException(400, 'Missing OIDC state')
    try:
        signed_value = _verified(aeromind_oidc_state)
        raw = base64.urlsafe_b64decode(signed_value + '=' * (-len(signed_value) % 4)).decode()
        expected_state, nonce, verifier, issued, return_token = raw.split('.', 4)
        if not secrets.compare_digest(expected_state, state) or time.time() - int(issued) > 600:
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(403, 'Invalid or expired OIDC state')
    async with httpx.AsyncClient(timeout=10) as client:
        discovery = (await client.get(f"{cfg['issuer']}/.well-known/openid-configuration")).raise_for_status().json()
        token_response = await client.post(discovery['token_endpoint'], data={'grant_type': 'authorization_code', 'code': code, 'client_id': cfg['client_id'], 'client_secret': cfg['client_secret'], 'redirect_uri': cfg['redirect_uri'], 'code_verifier': verifier})
        token_response.raise_for_status()
        tokens = token_response.json()
        signing_key = jwt.PyJWKClient(discovery['jwks_uri']).get_signing_key_from_jwt(tokens['id_token']).key
        claims = jwt.decode(tokens['id_token'], signing_key, algorithms=['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'], audience=cfg['client_id'], issuer=cfg['issuer'])
    email_candidates = _identity_email_candidates(claims)
    if claims.get('nonce') != nonce or not email_candidates:
        raise HTTPException(403, 'OIDC identity validation failed')
    identity_email = next((candidate for candidate in email_candidates
                           if account_for_identity(candidate, str(claims.get('sub'))) is not None), None)
    if identity_email is None:
        raise HTTPException(403, 'Compte Microsoft Entra préexistant requis et adresse non autorisée dans le registre AeroMind')
    session = _signed(_b64(f"{claims.get('sub')}|{identity_email}".encode()))
    # P2-02/P2-03 fix: register the session in the server-side allowlist so
    # logout can revoke it and server-side expiry is enforced.
    register_primary_session(session, str(claims.get('sub')), identity_email)
    try:
        return_to = base64.urlsafe_b64decode(return_token + '=' * (-len(return_token) % 4)).decode()
    except (ValueError, UnicodeDecodeError):
        return_to = '/'
    if not return_to.startswith('/') or return_to.startswith('//') or '\\' in return_to:
        return_to = '/'
    separator = '&' if '?' in return_to else '?'
    response = RedirectResponse(f"{return_to}#aeromind_session={quote(session, safe='')}")
    response.delete_cookie('aeromind_oidc_state', path='/')
    response.set_cookie('aeromind_session', session, max_age=28800, **_cookie_security())
    return response
