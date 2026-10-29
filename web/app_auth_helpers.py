import base64
from .config import get_settings
from .oidc import _verified, _session_token
from .admin import account_for_identity


def current_user(cookie: str | None, authorization: str | None = None):
    token = _session_token(cookie, authorization)
    if not token: return None
    try:
        verified = _verified(token)
        raw = base64.urlsafe_b64decode(verified + '=' * (-len(verified) % 4)).decode()
        subject, email = raw.split('|', 1)
        email = email.casefold()
        account = account_for_identity(email, subject)
        if account is None: return None
        if get_settings().is_superadmin_email(email): account = {**account, 'role': 'super_admin', 'accountStatus': 'active'}
        # Use the registry account id as the durable business owner. This
        # prevents projects from splitting when the same address changes
        # between Entra OIDC and local MFA sessions, while the verified
        # subject is still retained in the signed session validation above.
        return {'id': account.get('accountId') or subject, 'subject': subject, 'email': email, 'name': account.get('name') or email, 'role': account.get('role', 'user'), 'level': account.get('level', 'L1'), 'accountStatus': account.get('accountStatus', 'active')}
    except Exception:
        return None


def current_user_or_401(request) -> dict:
    """Return the authenticated user or raise 401 immediately.

    P0-01 fix (INSPECT-BACKEND B-CRIT-01): the canonical LABBENCH router
    `/api/lab/sessions/step-up` imports `current_user_or_401` from this
    module. Without this definition, every call raised ImportError and the
    entire /api/lab/* router (12 endpoints, 737 lines) was unreachable.
    """
    cookie = None
    authorization = None
    if request is not None:
        try:
            cookie = request.cookies.get('aeromind_session')
        except Exception:
            cookie = None
        try:
            authorization = request.headers.get('authorization')
        except Exception:
            authorization = None
    user = current_user(cookie, authorization)
    if user is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=401,
            detail={
                'code': 'UNAUTHENTICATED',
                'message': 'Authentication required for this endpoint.',
            },
        )
    return user
