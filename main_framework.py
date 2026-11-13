"""AeroMind — Z.ai preview framework entry point.

This module is invoked by the framework's preview supervisor (PID 965
/app/.venv/bin/python main.py) when traffic arrives at the preview URL.
It starts uvicorn on port 3000 (the port Caddy on :81 proxies to), serving
both the FastAPI /api/* routes and the compiled Vite frontend bundle from
frontend/dist/.
"""
import os
import sys
from pathlib import Path

# Ensure the aeromind/ project root is on sys.path so `web.app` resolves.
AEROMIND_ROOT = Path(__file__).parent / "aeromind"
sys.path.insert(0, str(AEROMIND_ROOT))
os.chdir(AEROMIND_ROOT)

# Bootstrap env (development defaults; production overrides via real env).
os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/aeromind.db")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "dev-secret-aeromind-cahier-charges-execution-2026-10-30-strong")
os.environ.setdefault("AEROMIND_AUTO_CREATE_SCHEMA", "true")
os.environ.setdefault("AEROMIND_ALLOWED_HOSTS", "*")
os.environ.setdefault("AEROMIND_ALLOWED_ORIGINS", "*")
os.environ.setdefault("PORT", "3000")
# The bash tool may inject an invalid DATABASE_URL=file:... — clear it.
if os.environ.get("DATABASE_URL", "").startswith("file:"):
    os.environ["DATABASE_URL"] = "sqlite:///./data/aeromind.db"

Path("data").mkdir(exist_ok=True)
Path("logs").mkdir(exist_ok=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "web.app:app",
        host="0.0.0.0",
        port=int(os.environ["PORT"]),
        log_level=os.environ.get("LOG_LEVEL", "info").lower(),
    )
