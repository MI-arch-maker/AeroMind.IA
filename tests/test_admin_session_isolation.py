import pytest
from fastapi import HTTPException
from starlette.requests import Request
from web.local_auth import _session_response


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
