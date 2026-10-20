import base64

from .config import get_settings
from .oidc import _verified


def current_user(cookie: str | None):
    if not cookie:
        return None
    try:
        verified = _verified(cookie)
        raw = base64.urlsafe_b64decode(verified + "=" * (-len(verified) % 4)).decode()
        subject, email = raw.split("|", 1)
        return {
            "id": subject,
            "email": email,
            "name": email,
            "role": "super_admin" if get_settings().is_superadmin_email(email) else "user",
        }
    except Exception:
        return None
