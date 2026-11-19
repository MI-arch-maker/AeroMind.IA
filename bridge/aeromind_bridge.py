import asyncio, json, math, time, websockets
from pymavlink import mavutil

WS_HOST = "127.0.0.1"
WS_PORT = 8765
MAVLINK_PORT = "udpin:127.0.0.1:14550"
MAVLINK_BAUD = 57600

connected_clients = set()
mav_conn = None
emergency_latched = False
human_authorized = False

def init_mavlink():
    global mav_conn
    try:
        print(f"[MAVLINK] Connexion sur {MAVLINK_PORT}...")
        mav_conn = mavutil.mavlink_connection(MAVLINK_PORT, baud=MAVLINK_BAUD)
        mav_conn.wait_heartbeat(timeout=2)
        print(f"[MAVLINK] CONNECTE - Systeme ID: {mav_conn.target_system}")
    except Exception as e:
        print(f"[MAVLINK] En attente materiel/simulateur ({e}).")
        mav_conn = None

def execute_physical_command(payload: dict):
    global emergency_latched, human_authorized
    if "emergency_stop" in payload:
        emergency_latched = bool(payload["emergency_stop"])
        if emergency_latched:
            print("\n[URGENCE ICX] !!! ARRET D URGENCE RECU - COUPURE IMMEDIATE !!!")
            if mav_conn:
                mav_conn.mav.command_long_send(mav_conn.target_system, mav_conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 21196, 0, 0, 0, 0, 0)
        else:
            print("[URGENCE ICX] Verrou d urgence rearme.")
        return

    cert = payload.get("validation_certificate", {})
    go_level = cert.get("go_level", "GO1")
    approval = cert.get("human_approval", False)

    if emergency_latched:
        print("[BLOQUE] Commande rejetee : verrou d urgence actif.")
        return

    if not approval or go_level not in {"GO4", "GO5"}:
        print(f"[BLOQUE] Gouvernance insuffisante (Niveau: {go_level}, Humain: {approval}).")
        return

    human_authorized = True
    cmd = payload.get("command", {})
    intent = cmd.get("intent")
    print(f"[EXECUTION PHYSIQUE] Ordre {intent} autorise ({go_level} + Humain) -> Envoi MAVLink...")

    if not mav_conn:
        print("[MAVLINK] Trame prete mais aucun controleur connecte sur le port.")
        return

    if intent == "arm":
        mav_conn.mav.command_long_send(mav_conn.target_system, mav_conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
    elif intent == "disarm":
        mav_conn.mav.command_long_send(mav_conn.target_system, mav_conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0)
    elif intent == "hold":
        mav_conn.mav.command_long_send(mav_conn.target_system, mav_conn.target_component, mavutil.mavlink.MAV_CMD_DO_SET_MODE, 0, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4, 0, 0, 0, 0, 0)
    elif intent == "return_to_home":
        mav_conn.mav.command_long_send(mav_conn.target_system, mav_conn.target_component, mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH, 0, 0, 0, 0, 0, 0, 0, 0)

async def telemetry_loop():
    telemetry_state = {"protocol": "MAVLink2", "vehicle_id": "AEROMIND-HIL-PHYS-01", "position": [46.520, 6.630, 0.0], "velocity": [0.0, 0.0, 0.0], "heading_deg": 0.0, "roll": 0.0, "pitch": 0.0, "yaw": 0.0, "link_quality": 1.0, "source": "hardware"}
    while True:
        if mav_conn:
            while True:
                msg = mav_conn.recv_match(blocking=False)
                if not msg:
                    break
                msg_type = msg.get_type()
                if msg_type == "ATTITUDE":
                    telemetry_state["roll"] = round(math.degrees(msg.roll), 2)
                    telemetry_state["pitch"] = round(math.degrees(msg.pitch), 2)
                    telemetry_state["yaw"] = round(math.degrees(msg.yaw), 2)
                    telemetry_state["heading_deg"] = telemetry_state["yaw"]
                elif msg_type == "GLOBAL_POSITION_INT":
                    telemetry_state["position"] = [msg.lat / 1e7, msg.lon / 1e7, msg.relative_alt / 1000.0]
                    telemetry_state["velocity"] = [msg.vx / 100.0, msg.vy / 100.0, msg.vz / 100.0]
            if connected_clients:
                telemetry_state["timestamp_ms"] = int(time.time() * 1000)
                data = json.dumps(telemetry_state)
                await asyncio.gather(*(client.send(data) for client in connected_clients), return_exceptions=True)
        await asyncio.sleep(0.05)

async def hotas_loop():
    try:
        import pygame
        pygame.init()
        pygame.joystick.init()
        if pygame.joystick.get_count() == 0:
            print("[HOTAS] Aucun manche physique detecte en USB.")
            return
        joy = pygame.joystick.Joystick(0)
        joy.init()
        print(f"[HOTAS] Peripherique physique actif : {joy.get_name()}")
        while True:
            pygame.event.pump()
            if mav_conn and human_authorized and not emergency_latched:
                roll = int(joy.get_axis(0) * 1000)
                pitch = int(joy.get_axis(1) * 1000)
                throttle = int(((-joy.get_axis(2) + 1) / 2) * 1000) if joy.get_numaxes() > 2 else 500
                yaw = int(joy.get_axis(3) * 1000) if joy.get_numaxes() > 3 else 0
                mav_conn.mav.manual_control_send(mav_conn.target_system, pitch, roll, throttle, yaw, 0)
            await asyncio.sleep(0.05)
    except Exception as e:
        print(f"[HOTAS] Module peripherique en veille ({e})")

async def ws_handler(websocket):
    connected_clients.add(websocket)
    print(f"[WS] Interface Aeromind connectee ({len(connected_clients)} client actif).")
    try:
        async for message in websocket:
            try:
                payload = json.loads(message)
                execute_physical_command(payload)
            except json.JSONDecodeError:
                print("[WS] Trame JSON invalide recu.")
    finally:
        connected_clients.remove(websocket)
        print("[WS] Interface Aeromind deconnectee.")

async def main():
    print("=================================================================")
    print("  AEROMIND HARDWARE BRIDGE - ICX POWER SOLUTIONS SRL")
    print("=================================================================")
    init_mavlink()
    server = await websockets.serve(ws_handler, WS_HOST, WS_PORT)
    print(f"[WS] Serveur Bridge actif sur ws://{WS_HOST}:{WS_PORT}")
    await asyncio.gather(server.wait_closed(), telemetry_loop(), hotas_loop())

if __name__ == "__main__":
    asyncio.run(main())
