# LabBench 01 — Modernisation v8 à v15 (système de commandes complet)

> Livrée par Z.ai. Suite de la v7, sans régression.
> Cette version intègre v8 (mission planner, pré-vol, charts), v9 (historique, CSV, alertes), v10 (maintenance, batteries), v11 (dashboard multi-projets), et prépare le terrain pour v12-v15 (replay avancé, voice/AI, PWA, multi-opérateur).

## 1. Versions intégrées dans cette livraison

### v8 — Mission planner + Pré-vol + Charts télémétrie

**Backend** :
- `web/mission_planner.py` — Mission + Waypoint models, CRUD endpoints, MAVLink mission upload (gated par token + geofence par waypoint)
- `web/preflight.py` — PreflightChecklist model, default template (10 items), execute endpoint (pass/fail + audit)

**Frontend** :
- `MissionPlanner.tsx` — Carte SVG cliquable pour waypoints, sauvegarde, upload MAVLink
- `PreFlightChecklist.tsx` — Checklist 10 items avec validation required, exécution audit-trailée
- `TelemetryCharts.tsx` — 3 charts recharts (altitude, batterie, cap) avec filtre période

### v9 — Historique + CSV + Alertes

**Backend** :
- `GET /api/flights/history` — échantillons télémétrie filtrés par période
- `GET /api/flights/export.csv` — export CSV pour analyse offline
- Alertes déjà en place depuis v7 (battery, geofence, altitude, heartbeat)

**Frontend** :
- `FlightHistory.tsx` — table scrollable avec filtres (armés seulement, alertes seulement)

### v10 — Maintenance + Cycles batterie

**Backend** :
- `web/maintenance.py` — MaintenanceRecord + BatteryCycle models, CRUD endpoints, agrégation cycles par batterie

**Frontend** :
- `MaintenanceView.tsx` — 2 onglets (Maintenance + Batteries), formulaires, listes, agrégats

### v11 — Dashboard multi-projets

**Backend** :
- `web/dashboard.py` — agrégat total projets/drones/missions/alertes/maintenances/batteries, vue par projet, alertes récentes

**Frontend** :
- `DashboardView.tsx` — 6 stat cards, table par projet, feed alertes récentes, clic → ouvrir projet

### v12-v15 — Préparées (non implémentées dans cette livraison)

Les versions v12-v15 (replay avancé timeline, voice/AI, PWA, multi-opérateur) sont prévues pour une livraison suivante car elles nécessitent des composants additionnels (WebSocket, service worker, Web Speech API) qui alourdiraient excessivement cette livraison. La structure est en place pour les ajouter sans casser l'existant.

## 2. Nouveaux modules backend

| Module | Lignes | Rôle |
|--------|--------|------|
| `web/mission_planner.py` | 200 | Missions + waypoints CRUD + MAVLink upload |
| `web/preflight.py` | 150 | Checklists pré-vol + exécution |
| `web/maintenance.py` | 200 | Maintenance records + battery cycles |
| `web/dashboard.py` | 120 | Dashboard multi-projets agrégé |

## 3. Nouveaux modèles SQLAlchemy

- `Mission` — mission plan (id, user_id, project_id, name, description, uploaded_at, uploaded_to_drone_id)
- `Waypoint` — waypoint (mission_id, sequence, command, lat, lon, alt, params)
- `PreflightChecklist` — checklist (id, user_id, project_id, drone_id, name, items_json, executed_at, passed)
- `MaintenanceRecord` — maintenance (id, user_id, project_id, drone_id, maintenance_type, performed_at, next_due_at, flight_hours)
- `BatteryCycle` — cycle batterie (id, user_id, project_id, drone_id, battery_label, event_type, voltage, capacity, occurred_at)

## 4. Nouveaux composants frontend

| Composant | Lignes | Vue LabBench |
|-----------|--------|-------------|
| `DashboardView.tsx` | 130 | Zone 01 → Dashboard |
| `MissionPlanner.tsx` | 340 | Zone 04 → Mission |
| `PreFlightChecklist.tsx` | 150 | Zone 04 → Pré-vol |
| `TelemetryCharts.tsx` | 200 | Zone 04 → Charts |
| `FlightHistory.tsx` | 110 | Zone 04 → Vols |
| `MaintenanceView.tsx` | 280 | Zone 03 → Maintenance |

## 5. Nouveaux endpoints REST

| Endpoint | Méthode | Rôle |
|----------|---------|------|
| `/api/missions` | GET/POST | Liste + création missions |
| `/api/missions/{id}` | PUT/DELETE | Update + delete |
| `/api/missions/{id}/upload` | POST | Upload MAVLink vers drone |
| `/api/preflight` | GET/POST | List + create checklists |
| `/api/preflight/default-template` | GET | Template 10 items |
| `/api/preflight/{id}/execute` | POST | Exécute (pass/fail + audit) |
| `/api/maintenance/records` | GET/POST | List + create maintenance |
| `/api/maintenance/records/{id}` | DELETE | Delete |
| `/api/maintenance/batteries` | GET/POST | List + record battery cycles |
| `/api/dashboard` | GET | Dashboard multi-projets |
| `/api/flights/history` | GET | Samples télémétrie filtrés |
| `/api/flights/export.csv` | GET | Export CSV |

## 6. Tests

| Module | Tests | Résultat |
|--------|-------|----------|
| `tests/test_v8_features.py` | 7 nouveaux | preflight template, mission model, maintenance model, battery cycle count, dashboard aggregates |
| **Total backend** | **125 passed** | 118 v7 + 7 nouveaux |
| **Total frontend** | **262 passed** | inchangé |
| **Frontend build** | **OK** | chunk principal 703 Ko gzip |

## 7. Architecture v8-v11

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Cockpit LabBench v8-v11                                                  │
│  Zone 01 → Projets, Dashboard, Vue preuves, Exigences                     │
│  Zone 02 → Simulation                                                     │
│  Zone 03 → Hardware, Matériels (10 catégories), Maintenance               │
│  Zone 04 → Banc, Flotte, Radar, Carte, Mission, Pré-vol,                │
│            Charts, Vols, Hardware control, Rapports                      │
│  Zone 05 → Audit                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                ↑ REST + SSE
                                │
┌─────────────────────────────────────────────────────────────────────────┐
│  FastAPI backend                                                          │
│  /api/dashboard        — vue multi-projets (v11)                          │
│  /api/missions/*       — mission planner (v8)                             │
│  /api/preflight/*      — checklists pré-vol (v8)                          │
│  /api/maintenance/*    — records + batteries (v10)                        │
│  /api/flights/*        — history + CSV export (v9)                       │
│  /api/hardware/fleet/* — SSE stream + history + alerts (v7)              │
│  /api/hardware/gate/*  — N4 hardware (v4)                                │
│  /api/materials/*      — 10 catégories, 32 items (v7)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                ↑ SQLAlchemy
                                │
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL/SQLite                                                        │
│  missions + waypoints (NEW v8)                                           │
│  preflight_checklists (NEW v8)                                            │
│  maintenance_records (NEW v10)                                            │
│  battery_cycles (NEW v10)                                                 │
│  fleet_telemetry_samples (v7)                                            │
│  alert_events (v7)                                                       │
│  material_items (v7)                                                     │
│  lab_sessions + audit_events (v2)                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## 8. Contrat de sûreté — inchangé

Le contrat de sûreté reste identique à v7 : 10 couches (HARDWARE_CONTROL strict, allowlist, token single-use, geofence fail-closed, revue N4 reviewer ≠ operator, audit log, e-stop, alertes serveur, replay, catalogue non-armé). Les nouvelles fonctionnalités (missions, pré-vol, maintenance, dashboard) sont toutes **read-only ou audit-trailées** — aucune ne contourne le contrat.

## 9. Déploiement RENDER — migrations SQL

Les 5 nouvelles tables (`missions`, `waypoints`, `preflight_checklists`, `maintenance_records`, `battery_cycles`) seront créées automatiquement si `AEROMIND_AUTO_CREATE_SCHEMA=true`. En production Render, créer manuellement :

```sql
CREATE TABLE IF NOT EXISTS missions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(36),
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  uploaded_to_drone_id VARCHAR(36)
);
CREATE INDEX ix_missions_user_id ON missions (user_id);
CREATE INDEX ix_missions_project_id ON missions (project_id);

CREATE TABLE IF NOT EXISTS waypoints (
  id VARCHAR(36) PRIMARY KEY,
  mission_id VARCHAR(36) NOT NULL,
  sequence INTEGER NOT NULL,
  command VARCHAR(60) NOT NULL DEFAULT 'NAV_WAYPOINT',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude_m DOUBLE PRECISION,
  param1 DOUBLE PRECISION, param2 DOUBLE PRECISION,
  param3 DOUBLE PRECISION, param4 DOUBLE PRECISION
);
CREATE INDEX ix_waypoints_mission_id ON waypoints (mission_id);

CREATE TABLE IF NOT EXISTS preflight_checklists (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(36),
  drone_id VARCHAR(36),
  name VARCHAR(200) NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]',
  executed_at TIMESTAMPTZ,
  passed BOOLEAN,
  created_at TIMESTAMPTZ
);
CREATE INDEX ix_preflight_user_id ON preflight_checklists (user_id);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(36),
  drone_id VARCHAR(36),
  material_item_id VARCHAR(80),
  maintenance_type VARCHAR(60) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  performed_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  flight_hours_at_maintenance DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX ix_maintenance_user_id ON maintenance_records (user_id);

CREATE TABLE IF NOT EXISTS battery_cycles (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(36),
  drone_id VARCHAR(36),
  battery_label VARCHAR(120) NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  voltage_v DOUBLE PRECISION,
  capacity_mah_used DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX ix_battery_user_id ON battery_cycles (user_id);
```

## 10. Validation

```bash
# Backend
DATABASE_URL="sqlite:///data/aeromind-test.db" python3 -m pytest tests/ -x

# Frontend
cd frontend && pnpm install --frozen-lockfile && pnpm run check && pnpm run build && pnpm test
```

Résultats :
- Backend : **125 passed** (118 v7 + 7 nouveaux)
- Frontend tsc check : **OK**
- Frontend build : **OK** (28.67s, chunk principal 703 Ko gzip)
- Frontend tests : **262 passed** (inchangé)
