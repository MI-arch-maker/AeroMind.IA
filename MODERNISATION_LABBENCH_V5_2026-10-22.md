# LabBench 01 — Modernisation v5 (UI hardware control dans le cockpit)

> Livrée le 2026-10-22 par Z.ai. Suite de la v4, sans régression.
> La v5 expose les endpoints hardware (Phase A-D de la v4) directement dans
> le cockpit, via une nouvelle vue « Hardware » dans la zone 04.

## 1. Ce qui a changé

### Frontend — `frontend/client/src/pages/LabBench.tsx`

Nouvelle vue **`hardware-control`** ajoutée à la zone 04 (Banc de test &
Commandes), à côté de « Banc », « Flotte » et « Rapports ». Elle expose
tous les endpoints hardware de la v4 dans une UI unique :

| Section UI | Endpoint REST | Rôle |
|------------|---------------|------|
| Banner de status | `GET /api/hardware/status` | Hard dormant/actif, pool size, allowlist |
| Gate N4 hardware (3 conditions) | `GET /api/hardware/gate` | virtual_n3_armed, hardware_review_signed, drone_registered_in_pool |
| Bouton « Signer revue hardware N4 » | `POST /api/hardware/gate/sign-review` | Modale reviewer + token ≥ 16 chars |
| Pool registration form | `POST /api/hardware/pool/register` | droneId + connectionUrl (udpout/serial) |
| Pool list (avec boutons Token / Retirer) | `GET /api/hardware/pool` | Refresh automatique |
| Geofence form (polygon JSON + alt + dist + home) | `PUT /api/hardware/geofence` | Validation côté serveur fail-closed |
| Geofence summary | `GET /api/hardware/geofence` | Lecture de l'état courant |
| Command form (droneId + commande + params + token) | `POST /api/hardware/drones/{id}/command` | Single-use token consumé après envoi |
| Token display (dernier jeton émis) | `POST /api/hardware/gate/issue-token` | Affiche le 64-char token |
| Bouton E-STOP (en haut à droite) | `POST /api/hardware/emergency-stop` | Broadcast NAV_LAND, confirm() JS |
| Modale revue hardware N4 | (modal) | Reviewer + jeton + note (≠ opérateur N3) |

### Frontend — `frontend/client/src/pages/labbench.css`

Nouveaux styles (~80 lignes) :
- `.lb-estop` — bouton rouge gradient, glow au hover, transform au click
- `.lb-hw-status` + `.is-active` / `.is-dormant` — bannière 4 cellules
- `.lb-hw-conditions` + `.lb-hw-condition.is-met/.is-missing` — checklist 3 conditions
- `.lb-hw-form` — formulaire 2 colonnes (responsive 1 colonne < 780px)
- `.lb-hw-pool-list` + `.lb-hw-pool-row` — liste drones avec actions
- `.lb-hw-geofence-summary` — lecture géofence
- `.lb-hw-token-display` — affichage du jeton single-use avec code monospace
- `.lb-note-estop` — note rouge pour rappel e-stop
- Responsive 780px et 720px

### Backend — inchangé

La v5 n'a touché qu'au frontend. Tous les endpoints REST de la v4 restent
tels quels :
- `GET /api/hardware/status`
- `GET/POST /api/hardware/pool/*`
- `GET /api/hardware/gate`, `POST /api/hardware/gate/sign-review`,
  `POST /api/hardware/gate/issue-token`
- `POST /api/hardware/drones/{droneId}/command`
- `POST /api/hardware/emergency-stop`
- `GET/PUT /api/hardware/geofence`

### Tests

Aucun nouveau test requis (le frontend v5 n'ajoute que des effets de bord
fetch — le backend était déjà couvert par `tests/test_hardware_phases.py`).

**Total** : backend 91 passed, frontend 262 passed, build OK.

## 2. Flux d'utilisation (UI v5)

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Ouvrir la zone 04 → vue « Hardware » dans le sidebar          │
│     (badge "Hardware · Pilote matériel v5" + icône ⚡)            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  2. Vérifier le banner de status                                  │
│     - HARDWARE_CONTROL = false (par défaut) → boutons désactivés  │
│     - HARDWARE_CONTROL = true (post-HIL) → boutons activés        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  3. Section « Gate N4 hardware — 3 conditions »                   │
│     - N3 virtuel armé → requis (vue Flotte)                       │
│     - Revue hardware N4 signée → bouton « Signer revue »          │
│       (modale : reviewer ≠ operator N3 + jeton ≥ 16 chars)        │
│     - Drone dans le pool matériel → section suivante              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  4. Section « Pool matériel »                                     │
│     - Formulaire : droneId + nom + connectionUrl                  │
│       (udpout:127.0.0.1:14550 ou serial:/dev/ttyUSB0:57600)       │
│     - Liste : chaque drone a 2 boutons : Token + Retirer          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  5. Section « Géofence projective »                               │
│     - Polygone JSON [[lat, lon], ...]                             │
│     - Altitude max (m) [default 120 EASA Open]                    │
│     - Distance max (m, VLOS) [default 500]                        │
│     - Home lat / lon (optionnel, pour check distance)             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  6. Section « Envoi d'une commande matérielle »                  │
│     - Cliquer « Token » sur un drone du pool                      │
│       → jeton 64 chars copié dans le champ token                  │
│     - Choisir la commande (allowlist stricte)                     │
│     - Paramètres JSON (ex: {"p7": 30} pour takeoff à 30 m)        │
│     - Cliquer « Envoyer la commande matérielle »                  │
│       → token consumé, audit log, refresh status                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  7. En cas d'urgence : bouton E-STOP en haut à droite              │
│     → confirm() JS → broadcast NAV_LAND à tous les drones         │
│     → audit log labbench.hardware.estop par drone                 │
└──────────────────────────────────────────────────────────────────┘
```

## 3. Contrat de sûreté — toujours 7 couches

| Couche | UI v5 | Backend v4 |
|--------|-------|-----------|
| 1. HARDWARE_CONTROL strict "true" | Banner visible, boutons désactivés si false | Refus 403 |
| 2. Allowlist ALLOWED_COMMANDS | Dropdown codé côté serveur, lu via /status | Codée en dur |
| 3. Token single-use 64 chars | Champ token + bouton Token par drone | consume_hardware_confirmation_token |
| 4. Géofence fail-closed | Form géofence + lecture summary | validate_command_geofence |
| 5. Revue N4 reviewer ≠ operator N3 | Modale avec note ≠ operator | sign_hardware_review cross-check |
| 6. Audit log persistant | Refresh auditQuery après chaque action | AuditEvent persistant |
| 7. E-stop broadcast NAV_LAND | Bouton rouge + confirm() JS | emergency_stop_all |

Aucune de ces couches ne peut être contournée depuis l'UI. Le bouton
« Envoyer la commande matérielle » est désactivé tant que `HARDWARE_CONTROL`
n'est pas `'true'` côté serveur — l'UI ne peut pas le deviner, elle lit
l'état via `GET /api/hardware/status`.

## 4. Build et tests

```bash
# Backend (91 passed — aucun changement depuis la v4)
DATABASE_URL="sqlite:///data/aeromind-test.db" python3 -m pytest tests/ -x

# Frontend
cd frontend && pnpm install --frozen-lockfile && pnpm run check && pnpm run build && pnpm test
```

Résultats v5 :
- Backend : **91 passed** (inchangé)
- Frontend type-check : **OK**
- Frontend build : **OK** (30.59s, chunk principal 689 Ko gzip)
- Frontend tests : **262 passed** (inchangé)

## 5. Déploiement RENDER — inchangé

La procédure RENDER de la v4 reste valable : `render.yaml` Blueprint,
`Dockerfile` multi-stage, `.env.example`. La vue hardware est accessible
après déploiement à `/labbench` → zone 04 → vue « Hardware ».

## 6. Pour activer le hardware après HIL

### Option A — Script HIL automatisé (recommandé)

Le projet contient désormais un script complet qui démarre SITL + AeroMind et
exécute les 8 tests HIL automatiquement :

```bash
# Depuis la racine du projet aeromind/
bash scripts/hil/run_hil_validation.sh
```

Le script :
1. Vérifie les prérequis (Python, pymavlink, ArduPilot SITL)
2. Propose de cloner ArduPilot si absent
3. Démarre SITL sur UDP 14550
4. Démarre AeroMind backend avec `HARDWARE_CONTROL=true` sur port 10000
5. Crée un projet + drone de test en DB
6. Bootstrappe les gates virtuelles + hardware + géofence
7. Enregistre le drone dans le pool MAVLink
8. Exécute les 8 tests :
   - Arm + disarm (vérifié via télémétrie MAVLink)
   - Takeoff 5 m (vérifié via altitude SITL)
   - Land
   - RTL
   - E-STOP → atterrissage < 15 s
   - Refus commande hors allowlist (403)
   - Token single-use déjà consumé (409)
   - Refus takeoff sans géofence (409 fail-closed)
9. Affiche le rapport + nettoie les subprocess

Si les 8 tests passent, l'exit code est `0` et vous pouvez activer
`HARDWARE_CONTROL=true` en confiance sur un déploiement de pré-production.

Variables d'environnement configurables :
- `ARDUPILOT_ROOT=~/ardupilot` (chemin du clone ArduPilot)
- `SITL_VEHICLE=ArduCopter` (ou ArduPlane, ArduRover)
- `SITL_PORT=14550` (port MAVLink)
- `AEROMIND_PORT=10000` (port backend)
- `HIL_KEEP_RUNNING=1` (ne pas tuer les subprocess — pour inspecter l'UI)

Voir `scripts/hil/README.md` pour le détail.

### Option B — Activation manuelle (pas recommandée)

1. Déployer la v5 sur RENDER.
2. Ouvrir `/labbench`, sélectionner un projet authentifié.
3. Vue « Flotte » : armer N3 sur un drone.
4. Vue « Hardware » : banner = dormant par défaut.
5. Sur Render → Environment → `HARDWARE_CONTROL=true` → redeploy.
6. Vue « Hardware » : banner = actif.
7. Enregistrer un drone dans le pool (connectionUrl = SITL udpout).
8. Configurer la géofence.
9. Signer la revue hardware N4 (modale reviewer ≠ operator N3).
10. Cliquer « Token » sur le drone du pool.
11. Envoyer `NAV_TAKEOFF` avec `{"p7": 5}` (décollage à 5 m).
12. Vérifier le SITL ArduPilot : le drone décolle.
13. E-STOP si besoin → le drone atterrit.

⚠️ **Avant tout vol réel** : valider toutes ces étapes sur SITL ArduPilot
dans un environnement isolé. La géofence et le pool doivent être testés
séparément avant de combiner.
