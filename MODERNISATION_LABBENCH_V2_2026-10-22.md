# LabBench 01 — Modernisation v2

> Modernisation livrée le 2026-10-22 par Z.ai (mode turbo, sans passage par manus.ai).
> Le cahier des charges applicable est défini dans la conversation de livraison :
> architecture modulaire à 5 zones, progression par gates (N1 → N2 → N3 armé → N4),
> procédure d'armement à double confirmation, et compatibilité RENDER complète.

## 1. Ce qui a changé

### Frontend — `frontend/client/src/pages/LabBench.tsx`

La page LabBench a été entièrement réécrite autour de **5 zones fonctionnelles**
qui remplacent l'ancienne liste plate de vues :

| # | Zone | Rôle | Niveau |
|---|------|------|--------|
| 01 | Gouvernance & Exigences | Projets, chaîne de preuves, exigences | N1 |
| 02 | Simulation & HIL | Moteur thermique synthétique N2 | N2 |
| 03 | Hardware & Drivers | Registre appareil + checklist conformité | N3 |
| 04 | Banc de test & Commandes | Armement N3 supervisé + consignes virtuelles | N3 → N4 |
| 05 | Preuves & Audit | Journal d'audit + signature revue N4 | tous niveaux |

Chaque zone affiche sa **progression de gate** (passé / ouverte / en attente)
directement dans la barre latérale, calculée côté serveur.

### Backend — `web/labbench.py`

Ajout d'un module de progression des gates (`GATE_KIND =
"labbench_gate_state.v1"`), persisté dans `LabSession` et **audit-trailé** dans
`AuditEvent`. Cinq procédures exposées via tRPC + REST :

| Procédure tRPC | Endpoint REST | Rôle |
|----------------|---------------|------|
| `labBench.gateState` | `GET /api/labbench/gates` | État courant des gates |
| `labBench.completeHardwareChecklist` | `POST /api/labbench/gates/hardware-checklist` | Persiste la checklist simulée (N3-READY) |
| `labBench.armN3` | `POST /api/labbench/gates/arm-n3` | Arme N3 après double confirmation + code second opérateur |
| `labBench.disarmN3` | `POST /api/labbench/gates/disarm-n3` | Désarme N3 |
| `labBench.signOffN4` | `POST /api/labbench/gates/sign-off-n4` | Signe la revue indépendante N4 |

**Contrat respecté** : aucune de ces procédures ne définit
`physicalOutputEnabled` à `true`. L'armement N3 ne déclenche aucune commande
physique ; il déverrouille uniquement les consignes virtuelles supervisées de
la zone 04 et reste traçable côté serveur.

### Tests — `tests/test_labbench_gates.py`

8 nouveaux tests couvrent la logique de progression : ordre des gates,
impossibilité de sauter une gate, agrégation par zone, valeurs par défaut
sûres (`physicalOutputEnabled=false`).

Tous les tests backend existants (47) et frontend (262) restent verts.

### Déploiement RENDER

- **`render.yaml`** : Blueprint mis à jour (autoDeploy: true, healthCheckPath:
  `/api/ready`, variables `sync: false` pour les secrets, plan free, région
  frankfurt, base PostgreSQL `aeromind-db` dans la même région).
- **`Dockerfile`** : build frontend pnpm@10.18.0 via corepack, runtime Python
  3.12 non-root, copie du bundle Vite compilé, démarrage `uvicorn
  web.app:app --host 0.0.0.0 --port ${PORT:-10000}`.
- **`frontend/vite.config.ts`** : les hôtes `manus.computer` ont été retirés
  (ils bloquaient l'accès Render), remplacés par `localhost`, `127.0.0.1` et
  `*.onrender.com` en dev/preview. Le build de production est servi par
  FastAPI (le preview Vite n'est utilisé qu'en développement local).
- **`.env.example`** : fichier créé (manquant) documentant toutes les variables
  d'environnement obligatoires et optionnelles.
- **`.dockerignore`** : inchangé (déjà correct).

## 2. Flux d'armement N3 (cahier des charges)

1. L'opérateur sélectionne un projet authentifié dans la zone 01.
2. Il lance et archive au moins une simulation N2 (zone 02) → gate N2 passée.
3. Il complète la checklist hardware simulée (zone 03) → gate N3-READY passée.
4. Il ouvre la zone 04 et clique « **Armer N3 (double confirmation)** » :
   - Modale de confirmation avec 3 champs :
     - Case 1 : « j'ai lu la procédure d'armement et l'absence de sortie physique »
     - Case 2 : « je confirme le périmètre virtuel exclusif »
     - Code second opérateur (≥ 6 caractères, hash SHA-256 côté serveur)
   - Le serveur vérifie que N3-READY est atteinte et enregistre un
     `armEvent` actif + un `AuditEvent` `labbench.gate.arm_n3`.
5. N3 armée, le mode « Commande virtuelle supervisée » devient actif. Les
   consignes virtuelles restent bornées 0–90° et **n'émet aucune sortie physique**.
6. L'opérateur peut désarmer N3 (un clic) à tout moment ; un audit
   `labbench.gate.disarm_n3` est enregistré.
7. La signature N4 (zone 05) clôt la progression après armement N3 : modale
   avec reviewer + jeton (≥ 8 caractères) + note optionnelle.

## 3. Frontière de contrôle — inchangée

La modernisation **ne régresse pas** le contrat de sûreté :

- `physicalOutputEnabled` reste `false` dans toutes les réponses serveur.
- `physicalCommandsEmitted` reste `false` dans tous les reçus.
- Aucune nouvelle route n'accepte un payload `physicalOutputEnabled: true`.
- L'armement N3 ne fait **que** déverrouiller un aperçu virtuel supervisé.

## 4. Vérification des tests

```bash
# Backend (47 tests existants + 8 nouveaux = 55)
DATABASE_URL="sqlite:///data/aeromind-test.db" python3 -m pytest tests/ -x

# Frontend (262 tests)
cd frontend && pnpm install --frozen-lockfile && pnpm run check && pnpm run build && pnpm test
```

Résultats au moment de la livraison :
- Backend : **55 passed**
- Frontend type-check : **OK**
- Frontend build : **OK** (28.59s)
- Frontend tests : **262 passed**

## 5. Déploiement sur RENDER

```bash
# 1. Pousser le dossier aeromind/ sur GitHub/GitLab.
# 2. Render → New → Blueprint → sélectionner le dépôt.
# 3. Région : frankfurt (service + base PostgreSQL dans la même région).
# 4. Appliquer le Blueprint. Render génère AEROMIND_SESSION_SECRET.
# 5. Compléter dans Environment :
#    - AEROMIND_ALLOWED_HOSTS = <votre-domaine>.onrender.com
#    - AEROMIND_ALLOWED_ORIGINS = https://<votre-domaine>.onrender.com
#    - ENTRA_* ou OIDC_* (au choix), OPENAI_API_KEY (optionnel)
# 6. Lancer un nouveau déploiement.
# 7. Vérifier /api/ready → {"ready": true, "database": "connected", "mode": "simulation"}.
```

Le health check Render (`/api/ready`) répond 200 quand la base est connectée
et renvoie le mode actif (`simulation` par contrat). Le front-end Vite compilé
est servi par FastAPI à la racine (`/`).
