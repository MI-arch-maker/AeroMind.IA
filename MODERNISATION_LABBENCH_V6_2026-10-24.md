# LabBench 01 — Modernisation v6 (Radar temps réel multi-drones)

> Livrée par Z.ai. Suite de la v5, sans régression.
> La v6 ajoute un **radar temps réel canvas-based** dans le cockpit, alimenté
> par un stream SSE à 2 Hz depuis le pool matériel MAVLink.

## 1. Ce qui a changé

### Backend — `web/fleet_telemetry.py` (nouveau, 200 lignes)

Nouveau routeur FastAPI `/api/hardware/fleet/*` qui agrège la télémétrie de
tous les drones du pool MAVLink :

| Endpoint | Méthode | Rôle |
|----------|---------|------|
| `/api/hardware/fleet/telemetry/snapshot` | GET | One-shot JSON pour le rendu initial |
| `/api/hardware/fleet/telemetry/stream` | GET (SSE) | Stream continu à 2 Hz (text/event-stream) |

Format du snapshot (JSON) :
```json
{
  "timestamp": "2026-10-24T12:34:56.789+00:00",
  "hardwareControlEnabled": false,
  "poolSize": 2,
  "geofenceConfigured": true,
  "homeLat": 38.0,
  "homeLon": -122.0,
  "maxAltitudeM": 120,
  "drones": [
    {
      "droneId": "abc-123",
      "droneName": "Drone 1",
      "connected": true,
      "armed": true,
      "position": {"latitude_deg": 38.001, "longitude_deg": -122.001, "altitude_m": 100, "relative_altitude_m": 5.2},
      "x_m": -88.4,
      "y_m": 111.0,
      "battery_remaining_pct": 78,
      "voltage_v": 12.4,
      "current_a": -3.2,
      "flight": {"heading": 45.0, "airspeed": 3.2},
      "gps": {"fix_type": 3, "satellites_visible": 12},
      "inside_geofence": true,
      "altitude_ok": true,
      "last_heartbeat_at": "2026-10-24T12:34:56+00:00",
      "messages_received": 1234
    }
  ]
}
```

**SSE** : le stream émet un snapshot complet toutes les 500 ms (2 Hz).
Le frontend `EventSource` se reconnecte automatiquement en cas de coupure.
`request.is_disconnected()` est pollué à chaque itération pour stopper
proprement quand le client ferme.

### Frontend — `frontend/client/src/components/FleetRadar.tsx` (nouveau, ~330 lignes)

Composant canvas-based qui :
- S'abonne au SSE `/api/hardware/fleet/telemetry/stream`
- Affiche un radar top-down centré sur le home de la géofence
- Dessine :
  - **Croix N/S/E/W** avec labels compas
  - **Cercles d'échelle** (25/50/100/200/500/1000 m selon zoom)
  - **Polygone géofence** en rouge pointillé + remplissage léger
  - **Trace de chaque drone** (40 derniers points, alpha progressif)
  - **Blip par drone** :
    - couleur stable par droneId (hash)
    - anneau batterie (vert / ambre / rouge selon niveau)
    - flèche de cap (heading)
    - label nom + altitude
    - clignotement rouge si hors géofence ou altitude dépassée
    - pulse ambre si armé
  - **Marqueur HOME** (triangle vert au centre)
- Toolbar : sélecteur d'échelle (100 m / 200 m / 500 m / 1 km / 2 km / 5 km),
  Pause/Reprendre, Effacer traces
- Stats : HW dormant/actif, count armés, count connectés, hors géofence, géofence config
- Liste détaillée des drones (couleur, nom, état ARMED/connected/offline,
  altitude, batterie, cap)
- Resize pour high-DPI (devicePixelRatio)
- Animation loop via `requestAnimationFrame` pour les clignotements

### Frontend — `frontend/client/src/pages/LabBench.tsx`

- Nouveau ViewId `"radar"` dans la zone 04 (Banc de test & Commandes)
- Import `FleetRadar` + icône `Crosshair`
- La vue `radar` rafraîchit automatiquement la géofence via le `useEffect`
  partagé avec la vue hardware-control
- SectionHeading + `<FleetRadar projectId={remoteProjectId} geofence={geofenceState} />`

### Frontend — `frontend/client/src/pages/labbench.css`

~40 lignes de nouveaux styles : `.lb-radar`, `.lb-radar-canvas-wrap`,
`.lb-radar-canvas` (canvas 1:1 aspect ratio), `.lb-radar-stats`,
`.lb-radar-list` (grille responsive), keyframe `lb-radar-spin` (loading).

## 2. Tests — 12 nouveaux (tests/test_fleet_telemetry.py)

| Test | Vérification |
|------|--------------|
| `test_snapshot_empty_pool` | Snapshot d'un pool vide → 0 drones |
| `test_snapshot_returns_drone_positions` | Snapshot contient lat/lon/alt/armed/battery/heading |
| `test_snapshot_computes_xy_when_geofence_home_set` | x_m / y_m calculés depuis home géofence |
| `test_snapshot_flags_drone_outside_geofence_polygon` | Drone hors polygone → inside_geofence=false |
| `test_snapshot_flags_drone_above_max_altitude` | Alt > max → altitude_ok=false |
| `test_snapshot_handles_disconnected_observer` | Observer déconnecté → connected=false, x_m=null |
| `test_snapshot_handles_multiple_drones` | Plusieurs drones simultanés |
| `test_snapshot_includes_geofence_metadata` | homeLat / homeLon / maxAltitudeM exposés |
| `test_snapshot_no_geofence_returns_null_home` | Pas de géofence → home null, x_m null |
| `test_haversine_xy_m_north_east` | Conversion lat/lon → x_m/y_m (nord + est) |
| `test_haversine_xy_m_south_west` | Conversion lat/lon → x_m/y_m (sud + ouest) |
| `test_point_in_polygon_simple_square` | Point-in-polygon ray-casting |

**Total backend : 99 passed** (87 existants + 12 nouveaux)
**Total frontend : 262 passed** (inchangé)
**Frontend build : OK** (chunk principal 692 Ko gzip, stable)

## 3. Architecture du stream SSE

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (LabBench.vue "Radar")                                       │
│    EventSource("/api/hardware/fleet/telemetry/stream")                │
│      onmessage → JSON.parse → setSnapshot + setTrails                 │
└─────────────────────────────────────────────────────────────────────┘
                                ↑ SSE (text/event-stream, 2 Hz)
                                │ data: {"timestamp": ..., "drones": [...]}
                                │
┌─────────────────────────────────────────────────────────────────────┐
│  FastAPI — web/fleet_telemetry.py                                     │
│    async def event_stream():                                          │
│      while True:                                                      │
│        if request.is_disconnected(): return                          │
│        yield f"data: {json.dumps(fleet_snapshot_sync(user_id))}\n\n"   │
│        await asyncio.sleep(0.5)                                       │
└─────────────────────────────────────────────────────────────────────┘
                                ↑ poll(max_messages=50) par drone
                                │
┌─────────────────────────────────────────────────────────────────────┐
│  MavlinkPool (web/mavlink_pool.py)                                    │
│    Pour chaque drone du pool :                                        │
│      observer.poll() → TelemetrySnapshot                              │
│        - position (GLOBAL_POSITION_INT)                               │
│        - heartbeat (HEARTBEAT, base_mode & 128 = ARMED)              │
│        - battery (SYS_STATUS / BATTERY_STATUS)                       │
│        - flight (VFR_HUD, heading)                                    │
│        - gps (GPS_RAW_INT)                                            │
└─────────────────────────────────────────────────────────────────────┘
                                ↑ MAVLink frames (TCP/UDP)
                                │
┌─────────────────────────────────────────────────────────────────────┐
│  ArduPilot SITL (HIL) ou Flight Controller réel (Pixhawk)            │
└─────────────────────────────────────────────────────────────────────┘
```

**Boucle de polling** : chaque drone a son propre `MavlinkObserver` créé
lors du `pool.register(...)`. Le stream SSE les agrège en un seul snapshot
JSON toutes les 500 ms.

**Read-only** : le radar ne fait que lire les frames MAVLink. Aucune commande
n'est envoyée par ce chemin.

## 4. Pour tester le radar

### Option A — Avec SITL (HIL)

```bash
# 1. Démarrer le script HIL automatisé (v5) en mode keep-running
HIL_KEEP_RUNNING=1 bash scripts/hil/run_hil_validation.sh

# 2. Ouvrir le cockpit
open http://localhost:10000/labbench

# 3. Aller dans zone 04 → vue "Radar"
#    Le radar affiche les drones du pool en temps réel pendant le test HIL.
```

### Option B — Sans SITL (vue dormant)

Le radar fonctionne même quand `HARDWARE_CONTROL=false` (mode dormant) :
- Si le pool est vide → canvas noir avec juste le HOME marker
- Si le pool a des drones sans connexion MAVLink → blips gris "awaiting"

### Option C — Avec un vrai flight controller

1. Brancher le Pixhawk en USB (`serial:/dev/ttyUSB0:57600`)
2. Vue Hardware → Pool registration → enregistrer avec `serial:/dev/ttyUSB0:57600`
3. Vue Radar → les drones apparaissent en temps réel dès le premier heartbeat

## 5. Contrat de sûreté — inchangé

Le radar est **read-only**. Il ne peut PAS :
- Envoyer de commande MAVLink
- Modifier la gate state
- Activer/désactiver un drone
- Changer la géofence

Toutes les actions restent sur les vues existantes (Hardware control, Flotte,
Banc). Le radar est purement une visualisation temps réel — il ne fait que
lire les frames que les observateurs MAVLink reçoivent déjà.

## 6. Déploiement RENDER — inchangé

Aucune variable d'environnement ajoutée. La SSE marche sur Render avec le
même `HARDWARE_CONTROL=false` par défaut. En production, le `Connection:
keep-alive` + `X-Accel-Buffering: no` (header ajouté) désactive le buffering
nginx pour le stream.

## 7. Limitations connues v6

- **Single-project geofence MVP** : le backend utilise la dernière géofence
  configurée (parmi tous les projets). En multi-projets, il faudra filtrer
  par `project_id` dans `_first_geofence()` — facile à étendre.
- **2 Hz** : suffisant pour visualisation, mais pour de l'analyse fine il
  faudra passer à 10 Hz (génère ~5× plus de trafic SSE).
- **Pas de replay** : les traces sont in-memory côté frontend ; au refresh
  de page, elles disparaissent. Une future v7 pourrait persister les traces
  en localStorage pour les réafficher au prochain chargement.
- **Pas d'historique serveur** : le stream ne fait que snapshot présent.
  Pour analyser un vol passé, il faudrait persister les snapshots dans une
  table `FleetTelemetrySample` (1 row per 500ms per drone — à densifier).

## 8. Améliorations futures possibles (v7+)

- Filtre par projet côté `_first_geofence()` (multi-projet)
- Replay des traces persistées (table `FleetTelemetrySample`)
- Récupération d'alertes SSE (drone hors géofence → push alerte dans audit log)
- Onglet cartographique OpenStreetMap pour vue extérieure (basé sur lat/lon
  géographiques plutôt que x_m/y_m centrés home)
- Notifications toast quand un drone sort de géofence ou perd heartbeat
