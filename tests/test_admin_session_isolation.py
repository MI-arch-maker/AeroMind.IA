import pytest
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response
from web.local_auth import _session_response
from web.admin_console_api import logout as admin_console_logout
from web.oidc import logout as oidc_logout
from web.primary_session_store import is_primary_session_active, register_primary_session


def _https_request():
    return Request({
        "type": "http", "http_version": "1.1", "method": "POST", "scheme": "https",
        "path": "/api/auth/local/login", "raw_path": b"/api/auth/local/login", "query_string": b"",
        "headers": [(b"x-forwarded-proto", b"https")], "client": ("127.0.0.1", 1234),
        "server": ("testserver", 443),
    })


def test_admin_console_mfa_issues_only_scoped_admin_cookie():
    response = _session_response({"id": "admin-1", "email": "admin@example.test", "role": "admin", "localAuthGeneration": 0}, _https_request(), admin_console=True)
    header = response.headers["set-cookie"]
    assert header.startswith("aeromind_admin_session=")
    assert "Path=/api/admin-console" in header
    assert "HttpOnly" in header and "Secure" in header
    assert "aeromind_session=" not in header


def test_admin_console_mfa_rejects_non_admin_role():
    with pytest.raises(HTTPException) as error:
        _session_response({"id": "user-1", "email": "user@example.test", "role": "user"}, _https_request(), admin_console=True)
    assert error.value.status_code == 403


def test_admin_console_logout_revokes_session_and_clears_current_and_legacy_cookie_paths():
    token = "admin-console-logout-test-token"
    register_primary_session(token, "admin-logout-test", "admin-logout@example.test")
    response = Response()

    result = admin_console_logout(response, admin_session=token)

    cookies = response.headers.getlist("set-cookie")
    assert result == {"logged_out": True}
    assert not is_primary_session_active(token)
    assert any("aeromind_admin_session=" in cookie and "Path=/api/admin-console" in cookie for cookie in cookies)
    assert any("aeromind_admin_session=" in cookie and "Path=/" in cookie for cookie in cookies)
    assert response.headers["cache-control"] == "no-store"


def test_oidc_logout_revokes_session_and_clears_main_session_cookie():
    token = "primary-logout-test-token"
    register_primary_session(token, "primary-logout-test", "primary-logout@example.test")

    response = oidc_logout(aeromind_session=token, authorization=None)

    cookies = response.headers.getlist("set-cookie")
    assert response.status_code == 200
    assert not is_primary_session_active(token)
    assert any("aeromind_session=" in cookie and "Path=/;" in cookie for cookie in cookies)
    assert any("aeromind_session=" in cookie and "Path=/api/auth/oidc" in cookie for cookie in cookies)
    assert response.headers["cache-control"] == "no-store"


def test_explicit_session_registration_reactivates_a_revoked_token():
    token = "primary-explicit-login-after-logout-test-token"
    register_primary_session(token, "explicit-login-test", "explicit-login@example.test")
    from web.primary_session_store import revoke_primary_session
    revoke_primary_session(token)
    assert not is_primary_session_active(token)

    register_primary_session(token, "explicit-login-test", "explicit-login@example.test")

    assert is_primary_session_active(token)
