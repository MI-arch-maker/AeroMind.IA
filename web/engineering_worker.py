"""Standalone entry point for the isolated AeroMind engineering file worker."""
from __future__ import annotations

import logging
import os

from .engineering_jobs import run_worker


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        poll = float(os.getenv("AEROMIND_ENGINEERING_WORKER_POLL_SECONDS", "0.5"))
    except ValueError:
        poll = 0.5
    run_worker(poll)


if __name__ == "__main__":
    main()
