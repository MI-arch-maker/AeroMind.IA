"""P1-01 fix — shared rate limiter for auth endpoints.

The Limiter was instantiated in app.py but never decorated on any route.
This module exports a singleton limiter that auth modules can import and
apply via @limiter.limit("5/minute").

Usage:
    from .rate_limit import limiter
    @router.post("/login")
    @limiter.limit("5/minute")
    def login(request: Request, ...): ...
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Singleton limiter — shared across all modules.
# app.py still registers the middleware + exception handler on the FastAPI app;
# this instance just provides the decorator for route modules.
limiter = Limiter(key_func=get_remote_address)
