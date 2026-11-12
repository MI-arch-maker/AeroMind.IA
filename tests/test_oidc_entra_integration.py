import pytest
from fastapi import HTTPException

from web.oidc import _is_microsoft_entra_issuer, _validate_tenant_claim


def test_entra_issuer_rejects_multi_tenant_authority():
    assert _is_microsoft_entra_issuer('https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0')
    assert not _is_microsoft_entra_issuer('https://login.microsoftonline.com/common/v2.0')
    assert not _is_microsoft_entra_issuer('https://login.microsoftonline.com/organizations/v2.0')


def test_tenant_claim_must_match_configured_tenant():
    cfg = {'tenant_id': 'tenant-a', 'client_id': 'client-a'}
    _validate_tenant_claim({'tid': 'tenant-a', 'ver': '2.0', 'azp': 'client-a'}, cfg)
    with pytest.raises(HTTPException):
        _validate_tenant_claim({'tid': 'tenant-b', 'ver': '2.0', 'azp': 'client-a'}, cfg)


def test_token_client_must_match_when_azp_present():
    with pytest.raises(HTTPException):
        _validate_tenant_claim({'tid': 'tenant-a', 'ver': '2.0', 'azp': 'other-client'}, {'tenant_id': 'tenant-a', 'client_id': 'client-a'})


def test_oidc_callback_requires_code_and_state():
    from fastapi.testclient import TestClient
    from web.app import app

    response = TestClient(app).get('/api/auth/oidc/callback', headers={'host': 'localhost'})
    assert response.status_code == 400
    assert 'incomplète' in response.json()['error']['message']


def test_oidc_callback_provider_error_is_sanitized():
    from fastapi.testclient import TestClient
    from web.app import app

    response = TestClient(app).get('/api/auth/oidc/callback?error=totally-secret&error_description=secret', headers={'host': 'localhost'})
    assert response.status_code == 401
    assert 'provider_error' in response.json()['error']['message']
    assert 'secret' not in response.json()['error']['message']
