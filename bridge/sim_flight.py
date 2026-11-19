import math
import time
from pymavlink import mavutil

print("=================================================================")
print("  AEROMIND MAVLINK FLIGHT SIMULATOR (20 Hz) · ICX POWER SOLUTIONS")
print("=================================================================")

# Connexion UDP sortante vers aeromind_bridge.py (qui ecoute sur 127.0.0.1:14550)
mav = mavutil.mavlink_connection("udpout:127.0.0.1:14550", source_system=1, source_component=1)
print("[SIM] Emission des trames binaires MAVLink v2 vers 127.0.0.1:14550...")

t0 = time.time()
base_lat = 46.5200
base_lon = 6.6300

try:
    while True:
        elapsed = time.time() - t0
        # Calcul d une trajectoire circulaire fluide avec virage incline
        angle = elapsed * 0.25
        roll = math.radians(18.0 * math.sin(elapsed * 0.6))
        pitch = math.radians(4.5 * math.cos(elapsed * 0.4))
        yaw = angle % (2 * math.pi)

        lat = int((base_lat + 0.002 * math.cos(angle)) * 1e7)
        lon = int((base_lon + 0.003 * math.sin(angle)) * 1e7)
        alt_mm = int((150.0 + 25.0 * math.sin(elapsed * 0.3)) * 1000)

        vx = int((-15.0 * math.sin(angle)) * 100)
        vy = int((15.0 * math.cos(angle)) * 100)
        vz = int((2.5 * math.cos(elapsed * 0.3)) * 100)

        # 1. Envoi du Heartbeat MAVLink
        mav.mav.heartbeat_send(
            mavutil.mavlink.MAV_TYPE_FIXED_WING,
            mavutil.mavlink.MAV_AUTOPILOT_GENERIC,
            0, 0, mavutil.mavlink.MAV_STATE_ACTIVE
        )

        # 2. Envoi de l attitude (Roll, Pitch, Yaw en radians)
        mav.mav.attitude_send(
            int(elapsed * 1000),
            roll, pitch, yaw,
            0.01, 0.01, 0.02
        )

        # 3. Envoi de la position GPS et vitesse
        mav.mav.global_position_int_send(
            int(elapsed * 1000),
            lat, lon,
            alt_mm, alt_mm,
            vx, vy, vz,
            int(math.degrees(yaw) * 100)
        )

        time.sleep(0.05)  # 20 Hz
except KeyboardInterrupt:
    print("\n[SIM] Arret du simulateur de vol.")
