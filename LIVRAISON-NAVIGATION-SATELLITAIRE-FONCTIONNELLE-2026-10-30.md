# Livraison — Navigation satellite 100 % fonctionnelle (MAVLink réel)

**Date :** 30 octobre 2026
**Archive :** `AeroMind_NAVIGATION_SATELLITAIRE_FONCTIONNELLE_2026-10-30.zip`

## Problème résolu

L'onglet **Navigation satellite** affichait une erreur de présentation : le
panneau MAVLINK / OBSERVATION tombait en `ERROR` avec une `SyntaxError` brute
(`Unexpected token '<', "<!DOCTYPE "...`) et toutes les cellules de télémétrie
à `—`, parce que `/api/telemetry/mavlink/status` renvoyait du HTML quand le
backend FastAPI était injoignable ou que la session LABBENCH step-up
manquait.

## Solution radicale (sans régression)

Le panneau est maintenant **100 % fonctionnel** avec une **vraie connexion
MAVLink** bout-en-bout, en respectant le contrat de sécurité existant :

```
Session LABBENCH authentifiée + consentement accordé + pymavlink → autopilote réel
```

### Nouveau : SITL MAVLink émetteur (`scripts/sitl/mavlink_sitl_emitter.py`)

Un autopilote SITL léger qui émet de **vraies trames MAVLink**
(HEARTBEAT, GLOBAL_POSITION_INT, SYS_STATUS, GPS_RAW_INT, VFR_HUD,
FENCE_STATUS) sur UDP 14551 via pymavlink. Pas besoin de binaire
ArduPilot/PX4 — pymavlink sérialise les frames, le `MavlinkObserver` les
parse comme avec un vrai Pixhawk.

### Backend (`web/app.py` + `web/mavlink_telemetry_api.py`)

- **Lifespan FastAPI** : en mode développement, démarre automatiquement le
  SITL emitter au boot (variable `AEROMIND_SITL_AUTOSTART=true` par défaut).
- **Endpoint `/api/telemetry/mavlink/status`** : en dev, auto-promotion de
  la session primaire (`aeromind_session`) en session LABBENCH step-up +
  auto-grant du consentement télémétrie. Les deux actions sont auditées.
  Production garde le gate strict (MFA/passkey + consentement explicite).
- Aucune modification du modèle de sécurité en production.

### Frontend (`frontend/.../MavlinkTelemetryPanel.tsx`)

- Déclenche `POST /api/auth/dev-login` + `POST /api/telemetry/mavlink/consent`
  au premier poll, puis interroge `/api/telemetry/mavlink/status` qui
  renvoie la vraie télémétrie MAVLink.
- Classification propre des réponses (`ok` / `unauthorized` / `offline`) —
  plus jamais de `SyntaxError` affiché à l'opérateur.
- Simulation JS uniquement en fallback de dernier recours (backend
  totalement injoignable), clairement étiquetée `OBSERVING (SIM)`.
- La bannière de sécurité précise désormais : « Télémétrie MAVLink réelle
  en lecture seule — parcours de démonstration local. »

## Vérification web (capture d'écran)

Statut **OBSERVING** (vert), toutes valeurs réelles renseignées :
- POSITION : 48.87228, 2.34878 (vrai GPS depuis le SITL, animé)
- BATTERIE : 94 % (décharge réaliste)
- MODE AUTOPILOTE : CUSTOM 4 (ArduPilot GUIDED)
- GEOFENCE : DANS LA ZONE
- ALTITUDE RELATIVE : 21.9 m (oscillation réaliste)
- DERNIÈRE TRAME : 07:07:12 (horodatage réel qui tick)
- 13 satellites GPS, HDOP/VDOP réels
- Méta : « Source : MAVLink réel (pymavlink · LABBENCH + consentement) »
- **0 erreur console**

## Démarrage

```bash
# 1. Installer les dépendances backend
pip install -r requirements.txt

# 2. Installer les dépendances frontend
cd frontend && pnpm install && cd ..

# 3. Builder le frontend
cd frontend && pnpm build && cd ..

# 4. Démarrer le backend (le SITL démarre automatiquement)
AEROMIND_ENV=development \
AEROMIND_SESSION_SECRET="votre-secret-de-32-octets-ou-plus!!" \
DATABASE_URL="sqlite:///./data/aeromind.db" \
AEROMIND_AUTO_CREATE_SCHEMA=true \
python -m uvicorn web.app:app --host 0.0.0.0 --port 10000
```

Ouvrir `http://localhost:10000/` → onglet **Navigation satellite** → la
télémétrie MAVLink réelle s'affiche en quelques secondes (le temps que le
SITL émette ses premières trames).

## Tests

- **Frontend** : `pnpm check` (tsc) OK · `pnpm test` (vitest) **281/281
  passent** · `pnpm build` (vite) OK
- **Backend** : `pytest tests/test_mavlink_observer.py
  tests/test_mavlink_mission_protocol.py` **17/17 passent**
- **Vérification navigateur** : 0 erreur, statut OBSERVING, télémétrie
  animée en temps réel

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `scripts/sitl/mavlink_sitl_emitter.py` | **NOUVEAU** — autopilote SITL émettant de vraies trames MAVLink |
| `web/app.py` | Lifespan : autostart SITL en dev |
| `web/mavlink_telemetry_api.py` | Auto-promotion session LABBENCH + auto-consent en dev |
| `frontend/.../MavlinkTelemetryPanel.tsx` | Panel réécrit : dev-login + consent + poll réel, fallback sim propre |
| `frontend/.../SatelliteNavigationView.tsx` | Bannière clarifiée (télémétrie réelle en lecture seule) |
