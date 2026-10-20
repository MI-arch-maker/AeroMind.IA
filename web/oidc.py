import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import quote, urlencode

import httpx
import jwt
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse

from .config import get_settings

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
        return _verified(token)
    except (ValueError, IndexError):
        raise HTTPException(401, 'Invalid session')


def _settings():
    cfg = get_settings().oidc
    if not cfg:
        raise HTTPException(503, 'OIDC/Entra is not configured')
    return cfg


def _identity_email(claims: dict) -> str | None:
    """Microsoft Entra peut exposer l’adresse sous plusieurs claims selon le tenant."""
    for key in ('email', 'preferred_username', 'upn', 'unique_name'):
        value = claims.get(key)
        if isinstance(value, str) and '@' in value:
            return value.strip().casefold()
    return None


def _cookie_security() -> dict[str, object]:
    # Le Preview public est HTTPS et embarqué dans un iframe cross-site.
    # Le développement local reste compatible HTTP.
    secure = get_settings().environment != 'development'
    return {'httponly': True, 'secure': secure, 'samesite': 'none' if secure else 'lax', 'path': '/'}


@router.get('/status')
def status():
    cfg = get_settings().oidc
    return {'configured': bool(cfg), 'provider': 'oidc' if get_settings().oidc_issuer else ('entra' if cfg else None)}


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
    return {
        'authenticated': True,
        'subject': subject,
        'email': email,
        'name': email,
        'role': 'super_admin' if get_settings().is_superadmin_email(email) else 'user',
        'trial_access': get_settings().is_trial_email(email),
    }


@router.api_route('/logout', methods=['GET', 'POST'])
def logout():
    response = JSONResponse({'logged_out': True})
    response.delete_cookie('aeromind_session', path='/')
    response.delete_cookie('aeromind_oidc_state', path='/')
    return response


@router.get('/login')
async def login():
    cfg = _settings()
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
        metadata = (await client.get(f"{cfg['issuer']}/.well-known/openid-configuration")).raise_for_status()
        discovery = metadata.json()
    state = _b64(secrets.token_bytes(32))
    nonce = _b64(secrets.token_bytes(32))
    verifier = _b64(secrets.token_bytes(48))
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    payload = f'{state}.{nonce}.{verifier}.{int(time.time())}'
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
        expected_state, nonce, verifier, issued = raw.split('.')
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
    identity_email = _identity_email(claims)
    if claims.get('nonce') != nonce or not identity_email:
        raise HTTPException(403, 'OIDC identity validation failed')
    response = RedirectResponse(f"/#aeromind_session={quote(session, safe='')}")
    response.delete_cookie('aeromind_oidc_state', path='/')
    session = _signed(_b64(f"{claims.get('sub')}|{identity_email}".encode()))
    response.set_cookie('aeromind_session', session, max_age=28800, **_cookie_security())
    return response
