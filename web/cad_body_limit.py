"""CAD request byte limits enforced before FastAPI multipart spooling.

This is a receive-stream bound, not just an UploadFile.read check. Upstream
proxies should also impose request/concurrency quotas for production isolation.
"""
from __future__ import annotations
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class CadBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_source_bytes: int = 25 * 1024 * 1024):
        self.app = app
        self.import_limit = max_source_bytes + 64 * 1024
        self.mutation_limit = 256 * 1024

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/cad/") or scope.get("method") not in {"POST", "PUT", "PATCH", "DELETE"}:
            return await self.app(scope, receive, send)
        limit = self.import_limit if path == "/api/cad/imports" else self.mutation_limit
        lengths = [v for k, v in scope.get("headers", []) if k.lower() == b"content-length"]
        if lengths:
            try:
                if len(lengths) != 1:
                    raise ValueError("ambiguous content length")
                length = int(lengths[0])
                if length < 0:
                    raise ValueError("negative content length")
            except (ValueError, OverflowError):
                return await JSONResponse({"detail": "Invalid CAD Content-Length"}, status_code=400)(scope, receive, send)
            if length > limit:
                return await JSONResponse({"detail": "CAD HTTP request exceeds the pre-parser byte limit"}, status_code=413)(scope, receive, send)
        consumed = 0

        async def bounded_receive() -> Message:
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > limit:
                    # Raised while FastAPI reads Request.form; its HTTPException
                    # handler produces 413 before the oversized chunk is spooled.
                    raise HTTPException(413, "CAD HTTP request exceeds the pre-parser byte limit")
            return message

        return await self.app(scope, bounded_receive, send)
