# Validation HIL — AeroMind LabBench 01 v5

Ce dossier contient le script de validation HIL automatisée qui démarre
ArduPilot SITL + AeroMind backend et exécute les 8 tests de la checklist HIL
en une seule commande.

## Démarrage rapide

```bash
# Depuis la racine du projet aeromind/
bash scripts/hil/run_hil_validation.sh
```

Le script :
1. Vérifie les prérequis (Python, pymavlink, ArduPilot SITL)
2. Demande à cloner ArduPilot si absent
3. Démarre SITL sur UDP 14550 (firmware ArduCopter simulé)
4. Démarre AeroMind backend avec `HARDWARE_CONTROL=true` sur port 10000
5. Crée un projet + drone de test en DB
6. Bootstrappe la gate virtuelle N3 armée + la gate hardware N4
7. Configure la géofence autour de la position home du SITL
8. Enregistre le drone dans le pool MAVLink
9. Exécute les 8 tests (arm/disarm, takeoff, land, RTL, e-stop, allowlist, token, geofence)
10. Affiche le rapport + nettoie les subprocess à la fin

Durée totale : ~2 minutes (dont ~30 s pour le premier démarrage SITL).

## Les 8 tests exécutés

| # | Test | Vérification |
|---|------|--------------|
| 1 | Arm + disarm | Le drone SITL passe ARMED → DISARMED (vérifié via télémétrie HEARTBEAT) |
| 2 | Takeoff 5 m | Le drone SITL monte à ≥ 3 m (vérifié via GLOBAL_POSITION_INT) |
| 3 | Land | Le drone SITL atterrit (alt ≤ 0.3 m) |
| 4 | RTL | Takeoff + RTL → atterrissage au home |
| 5 | E-STOP | Takeoff + e-stop → atterrissage en < 15 s |
| 6 | Refus commande hors allowlist | `MAV_CMD_DO_SET_HOME` → 403 COMMAND_NOT_ALLOWED |
| 7 | Token single-use déjà consumé | 2e envoi avec le même token → 409 TOKEN_ALREADY_USED |
| 8 | Refus takeoff sans géofence | Géofence supprimée → takeoff → 409 GEOFENCE_BREACH (fail-closed) |

Si les 8 passent, l'exit code est `0` et le message `✓ Validation HIL réussie`
s'affiche. AeroMind peut alors activer `HARDWARE_CONTROL=true` en confiance
sur un déploiement de pré-production.

## Variables d'environnement configurables

| Variable | Défaut | Rôle |
|----------|--------|------|
| `ARDUPILOT_ROOT` | `~/ardupilot` | Chemin du clone ArduPilot |
| `SITL_VEHICLE` | `ArduCopter` | Type de véhicule (`ArduCopter`, `ArduPlane`, etc.) |
| `SITL_PORT` | `14550` | Port UDP MAVLink du SITL |
| `AEROMIND_PORT` | `10000` | Port backend FastAPI |
| `SITL_HOME_LAT` | `38.0` | Latitude home SITL |
| `SITL_HOME_LON` | `-122.0` | Longitude home SITL |
| `HIL_KEEP_RUNNING` | `0` | `1` = laisser SITL + backend actifs après validation (pour inspection UI) |

## Mode debug — garder les subprocess en vie

```bash
HIL_KEEP_RUNNING=1 bash scripts/hil/run_hil_validation.sh
```

À la fin de la validation, le script ne tue PAS SITL ni AeroMind. Vous pouvez
alors :
- Ouvrir `http://localhost:10000/labbench` dans le navigateur
- Aller dans zone 04 → vue « Hardware » → voir le banner ACTIF
- Inspecter le journal d'audit (zone 05) pour les events `labbench.hardware.*`
- Tuer manuellement avec `kill <PID>` (les PIDs sont affichés)

## Logs générés

| Fichier | Rôle |
|---------|------|
| `logs/sitl.log` | Sortie console de `sim_vehicle.py` |
| `logs/uvicorn-hil.log` | Sortie console du backend AeroMind |
| `data/hil-validation.db` | Base SQLite HIL (supprimée à chaque exécution) |

## Prérequis détaillés

### Python 3.11+
```bash
python3 --version  # doit être >= 3.11
```

### pymavlink
Déjà dans `requirements.txt` — installé automatiquement par le script.

### ArduPilot SITL
Le script propose de cloner ArduPilot automatiquement si absent. Pour une
installation manuelle :

```bash
git clone https://github.com/ArduPilot/ardupilot.git --recurse-submodules ~/ardupilot
cd ~/ardupilot
# Installer les préreqs SITL (Ubuntu/Debian)
bash Tools/environment_install/install-prereqs-ubuntu.sh -y
```

Pour macOS : voir la doc ArduPilot (SITL macOS).

### Node + pnpm (pour le frontend build)
```bash
node --version  # >= 22
npm install -g pnpm@10.18.0
```

Si `frontend/dist` n'existe pas, le script lance automatiquement
`pnpm install --frozen-lockfile && pnpm run build`.

## Comprendre les tests

Le script `hil_validation.py` n'utilise PAS les endpoints HTTP — il appelle
directement les modules de service backend (`web.labbench`,
`web.hardware_gate`, `web.geofence_validator`, `web.mavlink_pool`,
`web.mavlink_command_api`). Cela évite la complexité OIDC et teste le
service layer complet + la connexion MAVLink réelle au SITL.

La télémétrie SITL est lue via une connexion MAVLink séparée
(`TelemetryReader`) qui observe le SITL en parallèle pour vérifier que les
commandes ont bien eu l'effet attendu (ARMED/DISARMED via le flag
`MAV_MODE_FLAG_SAFETY_ARMED` du HEARTBEAT, altitude via
`GLOBAL_POSITION_INT.relative_alt`).

## Que faire en cas d'échec

### Test 1 (Arm) échoue
- Vérifier `logs/sitl.log` — le SITL a-t-il démarré ?
- Vérifier le port : `SITL_PORT=14550` dans le shell vs `--mavlink-url` du script.
- Le drone SITL a besoin d'être en mode STABILIZE ou supérieur pour armer — le script
  suppose le mode par défaut.

### Test 2 (Takeoff) échoue
- Le drone SITL n'a peut-être pas de GPS lock. Attendre ~30 s de plus après le
  démarrage SITL. Le script attend 60 s mais certains SITL sont plus lents.
- Vérifier `logs/sitl.log` pour `GPS: ... satellites`.

### Test 5 (E-STOP) échoue
- Le SITL peut mettre > 15 s à atterrir. Augmenter le timeout dans
  `hil_validation.py::test_estop` (ligne ~deadline).

### Test 8 (Géofence) échoue
- La géofence n'a pas été supprimée correctement. Vérifier que
  `geofence_validator.clear_geofence` retourne bien `True`.

## Prochaines étapes après HIL réussi

Une fois les 8 tests verts :

1. **Test bench physique (N3)** : brancher un vrai Pixhawk sur USB, brancher
   les moteurs sur le banc (sans hélices), refaire les 8 tests.
2. **Tests au sol moteurs retirés** : idem avec hélices retirées pour vérifier
   la réactivité.
3. **Premier vol en cage** : dans une cage filet, opérateur sur le terrain,
   avec e-stop physique en main.
4. **Premier vol en extérieur** : revue N4 indépendante signée + autorisation
   de vol + zone de test déserte.

⚠️ Le HIL valide que votre code commande correctement le firmware. La
responsabilité du vol réel reste humaine.
