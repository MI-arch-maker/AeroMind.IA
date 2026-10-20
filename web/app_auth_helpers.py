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
        return {'id': subject, 'email': email, 'name': account.get('name') or email, 'role': account.get('role', 'user'), 'level': account.get('level', 'L1'), 'accountStatus': account.get('accountStatus', 'active')}
    except Exception:
        return None
