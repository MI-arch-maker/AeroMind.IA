#!/usr/bin/env python3
"""Observe an ArduPilot SITL/router endpoint without transmitting MAVLink frames."""
from __future__ import annotations
import argparse
import time
from web.mavlink_observer import MavlinkObserver

parser = argparse.ArgumentParser(description="Contrôle passif AeroMind derrière mavlink-router")
parser.add_argument("--url", default="udpin:127.0.0.1:14551")
parser.add_argument("--seconds", type=float, default=15)
parser.add_argument("--timeout", type=float, default=5)
args = parser.parse_args()

observer = MavlinkObserver(connection_url=args.url, heartbeat_timeout_s=args.timeout, reconnect_interval_s=2)
observer.connect()
deadline = time.monotonic() + args.seconds
seen: set[str] = set()
while time.monotonic() < deadline:
    snapshot = observer.poll()
    if snapshot.last_message_type:
        seen.add(snapshot.last_message_type)
    print({"status": snapshot.status, "connected": snapshot.connected, "messages": snapshot.messages_received, "last": snapshot.last_message_type, "heartbeat": snapshot.last_heartbeat_at}, flush=True)
    time.sleep(0.5)
observer.close()
required = {"HEARTBEAT", "SYS_STATUS"}
missing = required - seen
if missing:
    raise SystemExit(f"Télémétrie insuffisante; messages absents: {sorted(missing)}")
print("PASSIF_OK: aucune commande MAVLink n'est émise par ce script; QGC peut rester actif sur le second endpoint.")
