import pytest
from web.config import Settings

SECRET = "s" * 48


def test_demo_email_can_be_configured():
    settings = Settings(session_secret=SECRET, default_demo_email="mcgregoralvin14@gmail.com", _env_file=None)
    assert settings.default_demo_email == "mcgregoralvin14@gmail.com"


def test_demo_email_can_be_cleared():
    settings = Settings(session_secret=SECRET, default_demo_email="", _env_file=None)
    assert settings.default_demo_email is None


def test_invalid_demo_email_is_rejected():
    with pytest.raises(ValueError):
        Settings(session_secret=SECRET, default_demo_email="not-an-email", _env_file=None)
