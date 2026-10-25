# LabBench 01 — Modernisation v7 (Système de commandes complet + Material Library étendu)

> Livrée par Z.ai. Suite de la v6, sans régression.
> La v7 intègre toutes les améliorations d'un vrai système de commandes de drones :
> persistance télémétrie + replay, filtre multi-projets, alertes serveur, vue cartographique,
> et la Material Library étendue (moteurs, ESC, hélices, FC, caméras, capteurs, payloads non-armés).

## 1. Ce qui a changé

### Backend

**`web/models.py`** — 3 nouveaux modèles SQLAlchemy :
- `FleetTelemetrySample` — télémétrie persistée (1 row / 2s / drone, max 500 rows/drone = ~17 min)
- `AlertEvent` — alertes serveur (battery low, geofence breach, heartbeat lost, altitude breach)
- `MaterialItem` — items personnalisés de la Material Library (la catalog statique reste en Python)

**`web/alerts.py`** (nouveau, 80 lignes) — gestion des alertes :
- `raise_alert()` — insère une AlertEvent
- `list_recent_alerts()` — fetch pour le feed
- `acknowledge_alert()` — marquage acquitté (sort du feed live)

**`web/fleet_telemetry.py`** (étendu) — v7 :
- Filtre multi-projets : `_geofence_for_project(project_id)` (fallback last-set pour rétro-compat)
- Persistance : `_persist_sample()` toutes les 2s/drone (rolling 500 rows)
- Alertes : `_evaluate_alerts()` — battery <30%/15%, geofence breach, altitude max, heartbeat lost >10s
- Snapshot inclut `alerts: [...]` (récents, non acquittés)
- Nouveaux endpoints :
  - `GET /api/hardware/fleet/telemetry/history?drone_id=...&limit=500&since_iso=...` — replay
  - `GET /api/hardware/fleet/telemetry/history/range?project_id=...&minutes=15` — multi-drone range

**`web/material_library.py`** (nouveau, 350 lignes) — catalogue étendu :
- 10 catégories : propulsion, energy, structure, avionics, communication, optical, payload-non-weaponized, safety, maintenance, armament-hardware
- 32 items statiques incluant :
  - **Moteurs** : T-MOTOR MN3110 KV900, Hobbywing XRotor 2207 KV1400
  - **ESCs** : T-MOTOR ALPHA 60A 6S FOC
  - **Hélices** : T-MOTOR P12×4 (carbone), Gemfan 5×4×3 (tripale)
  - **Batteries** : Tattu 4S 1500mAh 75C, Tattu 6S 5000mAh 25C
  - **BMS / chargeurs** : Holybro PM06, ISDT Q6 Lite
  - **Frames** : Holybro X500 V2, DJI F450
  - **Train d'atterrissage** : Holybro LG-F500
  - **Flight controllers** : Pixhawk 6C
  - **GPS** : M9N, RTK F9P (cm)
  - **IMU** : ICM-42688
  - **Radios** : SiK 900 MHz, Microhard 2.4 GHz
  - **Antennes** : omnidirectionnelle 900 MHz 3dBi
  - **Caméras** : GoPro Hero12, FLIR Vue Pro thermique, MicaSense RedEdge multispectrale
  - **Gimbal** : Holybro GH4 3-axis
  - **LIDAR** : Velodyne Puck VLP-16
  - **Payloads NON-ARMÉS** : drop mechanism (livraison), pulvérisateur agricole 5L, éclairage LED 100W, relais LTE/5G, capteur de gaz multi
  - **Sécurité** : parachute Cirrus 1.5kg, strobe anti-collision, flare LED de détresse civile
  - **Maintenance** : tournevis dynamométrique, équilibreur d'hélices
  - **Hardware d'armement (NON arme)** : interrupteur à clé, PDB avec switch, connecteur magnétique anti-arrachement
- Endpoints :
  - `GET /api/materials/catalog?category=...&q=...` — liste filtrée
  - `GET /api/materials/categories` — 10 catégories
  - `POST /api/materials/items` — ajout item personnalisé (force `weaponized: false`)
  - `DELETE /api/materials/items/{id}` — suppression
- **Contrat de sûreté** : si un payload contient `weaponized: true` → 403 WEAPONIZED_FORBIDDEN

**`web/app.py`** (étendu) :
- `GET /api/hardware/alerts?projectId=...&droneId=...&all=true` — liste alertes
- `POST /api/hardware/alerts/{id}/acknowledge` — acquittement
- `GET /api/hardware/map/tiles-status` — statut tuiles hors-ligne

### Frontend

**`frontend/client/src/components/FleetRadar.tsx`** (étendu) — v7 replay mode :
- Bouton « Replay » dans la toolbar
- Charge l'historique via `GET /api/hardware/fleet/telemetry/history?drone_id=X&limit=500`
- Slider de scrub (range input)
- Sélecteur de vitesse (1× / 2× / 4× / 8×)
- Animation loop via `setInterval(500 / replaySpeed)`
- Construction d'un `replaySnapshot` synthétique depuis les samples persistés
- `displaySnapshot = replaySnapshot ?? snapshot` — le canvas rend en replay ou live
- Badge « REPLAY » dans les stats quand actif

**`frontend/client/src/components/FleetMap.tsx`** (nouveau, 150 lignes) — vue cartographique :
- SSE stream (même source que le radar)
- SVG-based map centrée sur le home géofence
- Bounding box auto-calculée (geofence polygon + drones + 10% pad)
- Drones comme markers colorés (vert = OK, ambre = armé, rouge = alerte)
- Geofence polygon (rouge pointillé)
- Home marker (triangle vert)
- Compass N/S/E/W
- Stats : stream actif, count géolocalisés, fond (tactical/satellite)

**`frontend/client/src/components/MaterialLibraryView.tsx`** (nouveau, 130 lignes) — Material Library UI :
- Recherche full-text (label, fabricant, PN, usage)
- Filtre par catégorie (chips cliquables avec count)
- Grid de cartes : icône catégorie, label, fabricant, PN, masse, dimensions, élec, I/O, airframes compatibles
- Footer : source (fabricant/concept/personnalisé) + statut armé/non-armé
- `forwardRef` pour exposer `refresh()` au parent

**`frontend/client/src/pages/LabBench.tsx`** :
- 2 nouvelles vues : `map` (zone 04) et `materials` (zone 03)
- Imports : FleetMap, MaterialLibraryView, icon `Map`
- `materialsRef` pour le refresh externe
- SectionHeading pour chaque vue avec eyebrow « v7 »

**`frontend/client/src/pages/labbench.css`** :
- ~50 lignes de nouveaux styles pour replay scrub, map SVG, material cards, chips

## 2. Tests

| Module | Tests | Résultat |
|--------|-------|----------|
| `tests/test_alerts.py` | 5 nouveaux | raise + list + ack + filters + unknown |
| `tests/test_material_library.py` | 14 nouveaux | 10 catégories, 30+ items, moteurs/ESC/hélices/FC/GPS/caméras/payloads non-armés/safety/armament-hardware non-armé, contrats non-weaponized |
| `tests/test_fleet_telemetry.py` | 12 (v6) | inchangés |
| **Total backend** | **118 passed** | 99 v6 + 19 nouveaux |
| **Total frontend** | **262 passed** | inchangé |

## 3. Contrat de sûreté — étendu v7

| Couche | v6 | v7 |
|--------|----|----|
| 1. HARDWARE_CONTROL strict "true" | ✅ | ✅ |
| 2. Allowlist ALLOWED_COMMANDS | ✅ | ✅ |
| 3. Token single-use 64 chars | ✅ | ✅ |
| 4. Géofence fail-closed | ✅ (last-set) | ✅ **par projet** (multi-project filter) |
| 5. Revue N4 reviewer ≠ operator N3 | ✅ | ✅ |
| 6. Audit log persistant | ✅ | ✅ + AlertEvent table |
| 7. E-stop broadcast NAV_LAND | ✅ | ✅ |
| 8. **Alertes serveur automatiques** | ❌ | ✅ (battery/geofence/altitude/heartbeat) |
| 9. **Replay depuis samples persistés** | ❌ | ✅ (FleetTelemetrySample table) |
| 10. **Catalogue matériel non-armé par contrat** | ❌ | ✅ (403 WEAPONIZED_FORBIDDEN) |

## 4. Architecture v7

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Cockpit (LabBench v7)                                                   │
│  Zone 03 → Matériels (10 catégories, 32 items, search, filter)            │
│  Zone 04 → Radar (live + replay), Carte (lat/lon), Hardware control       │
└─────────────────────────────────────────────────────────────────────────┘
                                ↑
                                │ REST + SSE
                                │
┌─────────────────────────────────────────────────────────────────────────┐
│  FastAPI backend                                                          │
│  /api/hardware/fleet/*  — SSE stream + history + alerts (v7)              │
│  /api/hardware/alerts/* — list + acknowledge                              │
│  /api/materials/*       — 10 categories, 32 items, custom items          │
│  /api/hardware/gate/*   — N4 hardware (v4)                                │
│  /api/hardware/drones/* — commands (v4)                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                ↑
                                │ SQLAlchemy
                                │
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL/SQLite                                                        │
│  fleet_telemetry_samples (NEW v7) — 500 rows/drone rolling                │
│  alert_events (NEW v7) — battery/geofence/altitude/heartbeat              │
│  material_items (NEW v7) — user custom items (non-weaponized enforced)    │
│  lab_sessions (v2) — gate states                                          │
│  audit_events (v2) — audit log                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

## 5. Flux d'utilisation v7

### Material Library étendu
1. Zone 03 → vue « Matériels »
2. Recherche libre ou clic sur une catégorie (chips)
3. Cartes affichent : label, fabricant, PN, masse, dimensions, élec, I/O, airframes
4. Footer : source (fabricant/concept) + statut non-armé
5. Bouton « Rafraîchir » en haut à droite

### Radar replay
1. Zone 04 → vue « Radar »
2. Laisser le stream tourner pendant quelques minutes (les samples se persistent en DB)
3. Cliquer « Replay » → charge l'historique de tous les drones du pool
4. Slider pour scrub manuel, ou laisser l'animation loop tourner
5. Sélecteur de vitesse (1× à 8×)
6. Cliquer « Live » pour revenir au temps réel

### Vue cartographique
1. Zone 04 → vue « Carte »
2. SVG-based map centrée sur le home géofence
3. Drones comme markers colorés (vert/ambre/rouge selon état)
4. Geofence polygon + home marker
5. Compass + bounding box

### Alertes
- Générées automatiquement côté serveur (battery <30% = warning, <15% = critical)
- Visibles dans le snapshot SSE → alimentent le radar (futures notifications toast)
- Acknowledge via `POST /api/hardware/alerts/{id}/acknowledge`

## 6. Déploiement RENDER — migrations

Les 3 nouvelles tables (`fleet_telemetry_samples`, `alert_events`, `material_items`)
seront créées automatiquement au démarrage si `AEROMIND_AUTO_CREATE_SCHEMA=true`
(comportement par défaut en dev). En production Render, basculer à `false` après
le premier déploiement et créer les tables manuellement :

```sql
-- À exécuter sur la base Render PostgreSQL si AEROMIND_AUTO_CREATE_SCHEMA=false
CREATE TABLE IF NOT EXISTS fleet_telemetry_samples (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(36),
  drone_id VARCHAR(36) NOT NULL,
  drone_name VARCHAR(200) NOT NULL DEFAULT '',
  sample_time TIMESTAMPTZ NOT NULL,
  latitude_deg DOUBLE PRECISION,
  longitude_deg DOUBLE PRECISION,
  altitude_m DOUBLE PRECISION,
  relative_altitude_m DOUBLE PRECISION,
  x_m DOUBLE PRECISION,
  y_m DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  battery_remaining_pct DOUBLE PRECISION,
  voltage_v DOUBLE PRECISION,
  current_a DOUBLE PRECISION,
  armed BOOLEAN NOT NULL DEFAULT FALSE,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  inside_geofence BOOLEAN NOT NULL DEFAULT TRUE,
  altitude_ok BOOLEAN NOT NULL DEFAULT TRUE,
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_fleet_telemetry_drone_time ON fleet_telemetry_samples (drone_id, sample_time);
CREATE INDEX ix_fleet_telemetry_samples_project_id ON fleet_telemetry_samples (project_id);
CREATE INDEX ix_fleet_telemetry_samples_drone_id ON fleet_telemetry_samples (drone_id);

CREATE TABLE IF NOT EXISTS alert_events (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36),
  drone_id VARCHAR(36),
  drone_name VARCHAR(200) NOT NULL DEFAULT '',
  alert_type VARCHAR(60) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by VARCHAR(255),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_alert_events_alert_type ON alert_events (alert_type);
CREATE INDEX ix_alert_events_project_id ON alert_events (project_id);
CREATE INDEX ix_alert_events_drone_id ON alert_events (drone_id);
CREATE INDEX ix_alert_events_created_at ON alert_events (created_at);

CREATE TABLE IF NOT EXISTS material_items (
  id VARCHAR(80) PRIMARY KEY,
  category VARCHAR(60) NOT NULL,
  label VARCHAR(240) NOT NULL,
  manufacturer VARCHAR(120),
  part_number VARCHAR(120),
  mass_kg DOUBLE PRECISION,
  dimensions TEXT,
  electrical TEXT,
  interfaces TEXT,
  use TEXT,
  compatible_airframes_json TEXT NOT NULL DEFAULT '[]',
  catalog_source VARCHAR(20) NOT NULL DEFAULT 'user',
  weaponized BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_material_items_category ON material_items (category);
```

## 7. Validation

```bash
# Backend
DATABASE_URL="sqlite:///data/aeromind-test.db" python3 -m pytest tests/ -x

# Frontend
cd frontend && pnpm install --frozen-lockfile && pnpm run check && pnpm run build && pnpm test
```

Résultats v7 :
- Backend : **118 passed** (99 v6 + 19 nouveaux)
- Frontend tsc check : **OK**
- Frontend build : **OK** (26.92s, chunk principal 696 Ko gzip)
- Frontend tests : **262 passed** (inchangé)

## 8. Prochaines améliorations possibles (v8+)

- Mission planner (waypoints + MAVLink mission upload)
- Pre-flight checklist UI
- Telemetry charts (altitude/battery/heading over time, line charts)
- Notifications toast quand une alerte serveur est levée
- Onglet historique complet des vols (filtre par date + export CSV)
- Maintenance schedule (cycles batterie, heures moteur, inspection)
- Multi-project dashboard (vue agrégée de tous les projets)
