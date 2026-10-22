# LabBench 01 — Modernisation v3 (multi-drones + chunks optimisés)

> Livrée le 2026-10-22 par Z.ai (mode turbo). Suite de la v2, sans régression.
> Deux améliorations demandées par l'utilisateur :
>   1. AeroMind peut piloter plusieurs drones à la fois (vue Flotte + gates par drone)
>   2. L'armement est opérationnel (modal à double confirmation, code second opérateur,
>      désarmement, audit-trail) — déjà en place en v2, étendu par drone en v3.

## 1. Multi-drones (Flotte)

### Backend — `web/labbench.py`

Sept nouvelles procédures exposées via tRPC + REST :

| Procédure tRPC | Endpoint REST | Rôle |
|----------------|---------------|------|
| `labBench.fleetGateState` | `GET /api/labbench/fleet?projectId=…` | État agrégé de toute la flotte |
| `labBench.perDroneGateState` | `GET /api/labbench/drones/{droneId}/gate?projectId=…` | Gate state d'un drone |
| `labBench.completeHardwareChecklistDrone` | `POST /api/labbench/drones/{droneId}/hardware-checklist` | Checklist N3-READY par drone |
| `labBench.armN3Drone` | `POST /api/labbench/drones/{droneId}/arm-n3` | Armement N3 par drone |
| `labBench.disarmN3Drone` | `POST /api/labbench/drones/{droneId}/disarm-n3` | Désarmement N3 par drone |
| `labBench.runFleetSimulation` | `POST /api/labbench/fleet/run-simulation` | Simulation N2 en parallèle sur N drones |
| (multi-drone management) | `GET/POST /api/projects/{projectId}/drones` | Liste / ajout de drones |
| | `GET/PUT/DELETE /api/projects/{projectId}/drones/{droneId}` | Read/update/delete |
| | `POST /api/projects/{projectId}/drones/{droneId}/activate` | Définir le drone primaire |

### Frontend — vue Flotte

Nouvelle vue `fleet` dans la zone 04 (Banc de test & Commandes) :

- Grille de cartes (1 carte par drone, max 12).
- Chaque carte affiche : nom, config (airframe/moteurs/masse), gates N1→N4 par drone,
  inputs scénario par drone, boutons Checklist N3 + Armer N3 / Désarmer.
- Bouton « Simuler flotte » : lance une simulation N2 parallèle sur tous les drones.
- Bouton « Ajouter un drone » : POST /api/projects/{id}/drones.
- Modale d'armement N3 par drone (double confirmation + code second opérateur ≥ 6).

### Tests

`tests/test_labbench_fleet.py` : 10 nouveaux tests
- gate state par drone démarre à N1 open
- N3 armé sur A ne touche pas B (indépendance)
- désarmement d'un drone n'affecte pas les autres
- agrégation de flotte
- cap à 12 drones (FLEET_TOO_LARGE)
- rejet d'un droneId inconnu
- rejet d'un payload `physicalOutputEnabled: true`
- armement exige N3-READY
- armement exige double confirmation
- armement exige code second opérateur ≥ 6 caractères

**Total : 65 tests backend passent (47 existants + 8 v2 gates + 10 v3 fleet).**

## 2. Frontend — chunk 4,7 Mo → 685 Ko gzip

### Avant (v2)
- `index-CvCfse8y.js` : **4 710 Ko** / **1 330 Ko gzip** (un seul gros chunk)
- Chargement initial lent sur 4G (~5 s)

### Après (v3)
- `index-B1g70Ncd.js` : **2 494 Ko** / **685 Ko gzip** (chunk principal, −48 %)
- `vendor-three` : 1 130 Ko / 313 Ko gzip (lazy — 3D MechanicalTwinViewport)
- `vendor-markdown` : 3 820 Ko / 1 159 Ko gzip (lazy — chat box AIChatBox)
- `vendor-hls` : 592 Ko / 185 Ko gzip (lazy — Home stream view)
- `vendor-radix`, `vendor-ui`, `vendor-data` : chunks séparés

### Mécanismes
- `Streamdown` lazy-loaded via `React.lazy(() => import("streamdown"))` dans `AIChatBox.tsx`.
- `manualChunks` dans `frontend/vite.config.ts` split les vendors lourds.

## 3. Armement N3 opérationnel (rappel)

L'armement N3 (déjà livré en v2) reste **opérationnel** et étendu par drone :

| Élément | Mono-drone (v2) | Multi-drone (v3) |
|---------|-----------------|------------------|
| Modale armement | ✅ | ✅ + modale par drone |
| Double confirmation | ✅ 2 cases | ✅ 2 cases par drone |
| Code 2nd opérateur | ✅ ≥ 6 chars (SHA-256) | ✅ ≥ 6 chars par drone |
| Re-check N3-READY | ✅ serveur | ✅ serveur par drone |
| Audit log | ✅ `labbench.gate.arm_n3` | ✅ `labbench.gate.arm_n3_drone` |
| Désarmement | ✅ | ✅ par drone (indépendant) |
| Re-gate | ✅ après désarmement | ✅ par drone |

## 4. Contrat de sûreté — toujours respecté

Aucune des procédures ajoutées n'active `physicalOutputEnabled`. Toutes les
routes serveur reject tout payload `physicalOutputEnabled: true`. L'armement
N3 (mono-drone ou multi-drones) ne déclenche aucune commande physique — il
déverrouille uniquement un aperçu virtuel supervisé.

## 5. Vérification des tests

```bash
# Backend : 65 tests (47 existants + 8 v2 + 10 v3)
DATABASE_URL="sqlite:///data/aeromind-test.db" python3 -m pytest tests/ -x

# Frontend : 262 tests
cd frontend && pnpm run check && pnpm run build && pnpm test
```

Résultats :
- Backend : **65 passed** (incl. 10 nouveaux tests fleet)
- Frontend type-check : **OK**
- Frontend build : **OK** (26.7s, −48 % sur le chunk principal)
- Frontend tests : **262 passed**

## 6. Déploiement RENDER — inchangé

La procédure RENDER de la v2 reste valable : `render.yaml` Blueprint,
`Dockerfile` multi-stage, `.env.example`. Aucun changement de variable
d'environnement. Le health check `/api/ready` répond 200 quand la base est
connectée.

## 7. Pour tester la vue Flotte après déploiement

1. Aller sur `/labbench`, sélectionner un projet authentifié.
2. Cliquer sur la zone 04 → « Flotte ».
3. Cliquer « Ajouter un drone » jusqu'à 3 drones.
4. Régler les consignes (°) par drone.
5. Cliquer « Simuler flotte (3) » : un run N2 est archivé par drone.
6. Pour chaque drone : « Checklist N3 » → « Armer N3 » (modale).
7. Vérifier dans l'audit (zone 05) : un `labbench.gate.arm_n3_drone` par drone.
8. Désarmer un drone — les autres restent armés.
