# LabBench 01 — Modernisation v4 (Phases A-D : pilote matériel opérationnel)

> Livrée le 2026-10-22 par Z.ai (mode turbo). Suite de la v3, sans régression.
> Quatre phases exécutées en parallèle : pilote MAVLink écriture (A), pool
> multi-drones (B), géofence + e-stop (C), gate N4 hardware (D).
>
> **Contrat de sûreté respecté** : `HARDWARE_CONTROL` reste `false` par défaut
> dans `render.yaml`, `.env.example`, et tous les déploiements existants. Le
> code matériel est livré **dormant** — il ne s'active qu'après validation HIL
> sur SITL ArduPilot + revue indépendante N4 hardware signée.

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LabBench 01 v4 — Flux d'une commande matérielle                  │
└─────────────────────────────────────────────────────────────────┘

  Opérateur (UI)
    │
    ├─→ [1] Enregistrer drone dans le pool
    │      POST /api/hardware/pool/register
    │      (droneId, connectionUrl="udpout:ip:port")
    │
    ├─→ [2] Configurer la géofence
    │      PUT /api/hardware/geofence { projectId, polygon, maxAltitudeM }
    │
    ├─→ [3] Signer la revue hardware N4
    │      POST /api/hardware/gate/sign-review
    │      (reviewer DIFFÉRENT de l'opérateur qui a armé le N3 virtuel)
    │
    ├─→ [4] Émettre un jeton single-use
    │      POST /api/hardware/gate/issue-token
    │      (vérifie virtual_n3_armed + hardware_review_signed +
    │       drone_registered_in_pool → renvoie un token de 64 chars)
    │
    └─→ [5] Envoyer la commande
           POST /api/hardware/drones/{droneId}/command
           (command ∈ allowlist, confirmationToken single-use,
            geofence validation)
              │
              ↓
        ┌────────────────────────────────────────────────────────┐
        │  Triple gate serveur                                    │
        │                                                          │
        │  Gate 1 : HARDWARE_CONTROL == "true" (strict)            │
        │  Gate 2 : command ∈ ALLOWED_COMMANDS (codée en dur)       │
        │  Gate 3 : confirmationToken valide + non consommé         │
        │  Gate 4 : geofence validation (fail-closed)               │
        │                                                          │
        │  Si tout passe → pymavlink.command_long_send(...)         │
        │  Sinon → HardwareCommandError, audit log, aucun envoi     │
        └────────────────────────────────────────────────────────┘
```

## 2. Nouveaux modules backend

| Fichier | Rôle | Lignes |
|---------|------|--------|
| `web/mavlink_command_api.py` | Phase A — Pilote MAVLink (envoi de `MAV_CMD`) avec allowlist stricte | ~190 |
| `web/mavlink_pool.py` | Phase B — Pool per-drone (max 12, idempotent) | ~140 |
| `web/geofence_validator.py` | Phase C — Géofence + e-stop broadcast `NAV_LAND` | ~210 |
| `web/hardware_gate.py` | Phase D — Gate N4 hardware avec reviewer indépendant + token single-use | ~210 |

## 3. Nouveaux endpoints REST

| Endpoint | Méthode | Rôle | Gate |
|----------|---------|------|------|
| `/api/hardware/status` | GET | Status public du subsystem hardware | — |
| `/api/hardware/pool` | GET | Liste des drones du pool | auth |
| `/api/hardware/pool/register` | POST | Enregistrer un drone | auth |
| `/api/hardware/pool/{droneId}/unregister` | POST | Retirer un drone | auth |
| `/api/hardware/gate` | GET | Gate state hardware | auth |
| `/api/hardware/gate/sign-review` | POST | Signer revue N4 hardware | auth + virtual N3 armed |
| `/api/hardware/gate/issue-token` | POST | Émettre un jeton single-use | auth + all gates |
| `/api/hardware/drones/{droneId}/command` | POST | Envoyer UNE commande MAVLink | auth + all 4 gates |
| `/api/hardware/emergency-stop` | POST | Broadcast `NAV_LAND` à tous les drones | auth |
| `/api/hardware/geofence` | GET / PUT | Lire / configurer la géofence | auth |

## 4. Allowlist stricte (codée en dur)

```python
ALLOWED_COMMANDS = (
    "COMPONENT_ARM_DISARM",  # arm / disarm
    "NAV_TAKEOFF",           # takeoff
    "NAV_LAND",              # land
    "NAV_RETURN_TO_LAUNCH",  # RTL
    "DO_SET_MODE",           # switch flight mode (limited)
)

ALLOWED_MODES = (0, 1, 2, 4, 6, 80, 81)  # PREFLIGHT/STABILIZE/MANUAL/GUIDED/AUTO
```

Aucune wildcard. Aucune extension dynamique possible sans commit de code.
Toute commande hors allowlist → `HardwareCommandError 403 COMMAND_NOT_ALLOWED`.

## 5. Tests

`tests/test_hardware_phases.py` : **26 nouveaux tests** couvrent :

**Phase A (Pilote)** — 7 tests
- Refuse commande si HARDWARE_CONTROL != "true"
- Refuse commande hors allowlist
- Refuse token < 16 caractères
- Refuse mode hors allowlist
- Envoie takeoff quand tout est OK
- Gère échec transport gracieusement
- Bornes altitude EASA Open (0.5–120 m)

**Phase B (Pool)** — 5 tests
- Register + list
- Register idempotent
- Cap à MAX_POOL_SIZE (12)
- Unregister
- Pilot pour drone inconnu → erreur

**Phase C (Géofence + E-stop)** — 8 tests
- Fail-closed sans géofence
- Rejette altitude > max
- Rejette hors polygone
- Accepte dans polygone
- Rejette si hardware disabled
- Storage roundtrip
- E-stop no-op si hardware disabled
- E-stop envoie `NAV_LAND` (cmd_id 21) à chaque drone

**Phase D (Gate N4 HW)** — 6 tests
- Démarre toutes conditions à False
- Revue exige N3 virtuel armé
- Flow complet revue
- Issue token exige toutes conditions
- Issue + consume token (single-use)
- Token invalide → erreur

**Total backend : 91 passed** (65 v3 + 26 v4)
**Total frontend : 262 passed** (inchangé)

## 6. Frontend — inchangé

La v4 n'a pas touché au frontend. La vue « Flotte » (v3) reste l'interface
principale. Les endpoints hardware sont accessibles via cURL / Postman pour
la phase HIL de validation, avant l'ajout d'une UI hardware dédiée (v5
future).

## 7. Procédure d'activation hardware (post-HIL)

⚠️ À exécuter uniquement après tests HIL complets sur SITL ArduPilot/PX4.

```bash
# 1. Bascule du flag
export HARDWARE_CONTROL=true

# 2. Démarrer le service
uvicorn web.app:app --host 0.0.0.0 --port 10000

# 3. Enregistrer un drone dans le pool
curl -X POST http://localhost:10000/api/hardware/pool/register \
  -H "Content-Type: application/json" \
  -H "Cookie: aeromind_session=<your-session>" \
  -d '{"droneId":"<uuid>","droneName":"Drone 1","connectionUrl":"udpout:127.0.0.1:14550","projectId":"<uuid>"}'

# 4. Configurer la géofence
curl -X PUT http://localhost:10000/api/hardware/geofence \
  -H "Content-Type: application/json" \
  -H "Cookie: aeromind-session=<your-session>" \
  -d '{"projectId":"<uuid>","polygon":[[48.0,2.0],[48.1,2.0],[48.1,2.1],[48.0,2.1]],"maxAltitudeM":120}'

# 5. Signer la revue N4 hardware (reviewer != operator N3)
curl -X POST http://localhost:10000/api/hardware/gate/sign-review \
  -H "Content-Type: application/json" \
  -H "Cookie: aeromind_session=<your-session>" \
  -d '{"projectId":"<uuid>","reviewer":"independent@example.com","reviewToken":"very-long-token-12345"}'

# 6. Émettre un jeton single-use
curl -X POST http://localhost:10000/api/hardware/gate/issue-token \
  -H "Content-Type: application/json" \
  -H "Cookie: aeromind_session=<your-session>" \
  -d '{"projectId":"<uuid>","droneId":"<uuid>"}'
# → { "token": "abc...64chars..." }

# 7. Envoyer la commande (ex: takeoff à 30 m)
curl -X POST http://localhost:10000/api/hardware/drones/<droneId>/command \
  -H "Content-Type: application/json" \
  -H "Cookie: aeromind_session=<your-session>" \
  -d '{"projectId":"<uuid>","command":"NAV_TAKEOFF","confirmationToken":"abc...64chars...","parameters":{"p7":30}}'

# 8. E-stop (si besoin)
curl -X POST http://localhost:10000/api/hardware/emergency-stop \
  -H "Cookie: aeromind_session=<your-session>"
```

Chaque appel est audit-trailé dans la table `audit_events` avec un
`event_type` distinct :
- `labbench.hardware.review_signed`
- `labbench.hardware.token_issued`
- `labbench.hardware.command_sent` (si envoyée)
- `labbench.hardware.command_refused` (si refusée)
- `labbench.hardware.estop` (par drone)

## 8. Contrat de sûreté — résumé

| Couche | Mécanisme | Activée par défaut |
|-------|-----------|-------------------|
| 1 | `HARDWARE_CONTROL` env var strict `"true"` | NON (false) |
| 2 | Allowlist `ALLOWED_COMMANDS` codée en dur | OUI (toujours) |
| 3 | Token single-use (16+ chars) | N/A |
| 4 | Géofence validation fail-closed | OUI (toujours) |
| 5 | Revue N4 hardware reviewer != operator N3 | N/A |
| 6 | Audit log persistant par commande | OUI (toujours) |
| 7 | E-stop broadcast `NAV_LAND` | OUI (toujours, 1 clic) |

Aucune de ces couches ne peut être contournée par un flag, une variable
d'environnement ou un payload. Toute modification d'allowlist ou de la
logique de gate nécessite un commit de code (revue de sécurité obligatoire).
