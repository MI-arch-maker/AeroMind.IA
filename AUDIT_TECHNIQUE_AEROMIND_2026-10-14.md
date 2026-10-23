# Audit technique complet — AeroMind

**Date de l’audit :** 14 octobre 2026  
**Périmètre :** dépôt `/home/ubuntu/work_aeromind`  
**Mode d’intervention :** lecture seule sur les composants applicatifs ; aucune suppression, substitution ou modification de composant effectuée pendant l’audit.  
**Statut global :** **fonctionnel en démonstration N2 / simulation**, **non prêt pour une mise en production complète** sans correction des écarts de contrats API, de persistance et de vérification d’intégration.

> Règle appliquée : aucune fonction n’est classée « opérationnelle » sans preuve dans le code et/ou une vérification d’exécution reproductible. Une animation, une formule locale ou une réponse de compatibilité ne vaut pas preuve d’un moteur physique, d’un stockage durable ou d’une IA externe réellement exécutée.

## 1. Résumé exécutif

### Verdict

AeroMind est une application full-stack **bootable** composée d’un frontend React/Vite et d’un backend FastAPI/SQLAlchemy. Le frontend expose les trois modules demandés :

- atelier de conception/assemblage et dessin paramétrique ;
- centre virtuel de simulation et d’analyse ;
- hall virtuel d’essais en vol.

La frontière de sécurité N2 est bien représentée côté serveur et côté frontend : aucun chemin actif d’armement matériel, d’écriture télémétrique ou de téléversement de mission n’a été trouvé dans le parcours courant. L’API `/api/health`, `/api/ready`, `/api/capabilities` et `/api/sitl/status` répondent correctement avec l’hôte autorisé.

Cependant, l’intégration technique n’est pas homogène : le frontend appelle des procédures tRPC que le bridge FastAPI ne traite pas. Les procédures inconnues retombent sur une réponse `data: null` au lieu d’un `404`, ce qui peut transformer une fonctionnalité absente en état visuellement silencieux. Les versions, rapports, événements d’audit, fonctions avancées LabBench et le chat IA n’ont donc pas tous une preuve de bout en bout.

### Niveau de maturité estimé

| Domaine | Évaluation |
| --- | --- |
| Démarrage/import backend | **Opérationnel et vérifié** |
| Build frontend | **Opérationnel et vérifié** |
| Tests frontend | **Opérationnel et vérifié : 25 fichiers / 131 tests** |
| UI des trois modules | **Visuelle et interactive en local** |
| Calcul local déterministe | **Partiellement opérationnel** |
| CFD/OpenFOAM | **Absent sur le runtime vérifié ; préparation seulement** |
| IA externe | **Conditionnelle à `OPENAI_API_KEY`; contrat frontend incomplet** |
| Stockage local | **Partiellement opérationnel ; snapshot mémoire côté serveur** |
| Stockage authentifié SQL | **Présent pour certains flux ; non couvert de bout en bout** |
| Déploiement Docker | **Déclaré mais non vérifiable ici : Docker absent** |
| N2 / verrouillage matériel | **Opérationnel et vérifié statiquement + tests frontend** |
| Mise en production complète | **Non recommandée à ce stade** |

## 2. Méthode et preuves collectées

### Contrôles réalisés

- Inventaire des fichiers source, packages, tests et fichiers de déploiement.
- Lecture des points d’entrée FastAPI, routes métier, authentification, état opérationnel et base SQLAlchemy.
- Lecture des trois modules frontend et des moteurs locaux.
- Comparaison automatique des procédures tRPC utilisées par le frontend avec les branches du bridge FastAPI.
- Exécution de la suite Vitest.
- Exécution du type-check TypeScript et du build Vite.
- Import et démarrage FastAPI avec `TestClient`.
- Vérification des endpoints publics avec `Host: localhost`.
- Vérification du rejet de `physicalOutputEnabled=true`.
- `pip check`, vérification de la disponibilité de Docker et mesures de taille des bundles.
- Contrôle statique des références secrets, matériel, OpenFOAM, IA et stockage.

### Résultats reproductibles

```text
pnpm --dir frontend test
25 passed / 25 test files
131 passed / 131 tests

pnpm --dir frontend exec tsc --noEmit
OK

pnpm --dir frontend run build
OK — built in 15.26s

/api/health       200  {status: ok, db: connected, oidc: not_configured}
/api/ready        200  {ready: true, database: connected, mode: simulation}
/api/capabilities 200  {hardware_control: false, mission_upload: false, telemetry_write: false}
/api/sitl/status  200  {mode: simulation, hardware_control: false}
```

Le premier test `TestClient` sans en-tête Host autorisé a retourné `400 Invalid host header`. Avec `Host: localhost`, le contrat répond correctement. Cela confirme que `TrustedHostMiddleware` est actif, mais que les tests doivent explicitement utiliser un hôte configuré.

## 3. Architecture actuelle

```text
Navigateur
  │
  ├─ React 19 / Vite / TypeScript
  │    ├─ Home.tsx : cockpit principal, navigation, état et mutations
  │    ├─ DroneSketchProWorkbench : dessin paramétrique 2D/SVG et métadonnées
  │    ├─ VirtualAssemblyWorkshop / DesignStudioView : conception et assemblage
  │    ├─ VirtualSimulationCenter : scène et analyse visuelles locales
  │    ├─ VirtualFlightTestHall : hangar et scénarios illustratifs locaux
  │    └─ LabBench : démonstrateur thermique et frontière de contrôle
  │
  ├─ tRPC HTTP compatibility bridge : /api/trpc/{procedure}
  │
  └─ FastAPI / Uvicorn
       ├─ /api/health, /api/ready, /api/capabilities
       ├─ /api/auth/oidc/*
       ├─ /api/projects, drones, simulations, reports, lab-sessions
       ├─ /api/engineering/*
       ├─ /api/copilot/chat
       ├─ /api/operational-state/*
       ├─ /api/control/* — verrouillé matériellement
       ├─ /api/sitl/status
       └─ /api/local/workspace
            │
            ├─ SQLAlchemy → SQLite local ou PostgreSQL via DATABASE_URL
            └─ dictionnaire mémoire `_local_workspaces` pour le snapshot local
```

### Backend

- FastAPI `web/app.py`.
- Uvicorn comme serveur ASGI.
- SQLAlchemy 2 avec modèles `User`, `Project`, `Drone`, `Simulation`, `Report`, `LabSession`, `UserSetting`, `HardwareLog`.
- SQLite par défaut (`data/aeromind.db`), PostgreSQL via `DATABASE_URL`.
- `Base.metadata.create_all()` au démarrage ; aucun répertoire de migrations versionnées n’a été trouvé dans le périmètre inspecté.
- Authentification OIDC/Entra avec cookie signé HMAC et validation JWT côté callback.
- `TrustedHostMiddleware`, CORS conditionnel et headers de sécurité.
- Machine d’état serveur bloquée sur N2.

### Frontend

- React 19, Vite 7, TypeScript strict.
- React Query/tRPC côté client.
- Three.js/React Three Fiber présents dans les dépendances et plusieurs composants, mais les deux nouveaux modules inspectés utilisent principalement des scènes CSS/SVG stylisées plutôt qu’un moteur de scène 3D physique.
- Persistance locale via `localStorage`, `BroadcastChannel` et snapshot Zod v2.
- Persistance distante via mutations tRPC et endpoints FastAPI de compatibilité.

## 4. Inventaire fonctionnel par catégorie

### 4.1 Opérationnelles et testées

| Fonction | Preuve |
| --- | --- |
| Build frontend | `vite build` terminé avec succès |
| Type-check TypeScript | `tsc --noEmit` réussi |
| Moteur local `runSimulation` | Fonction pure dans `aeroEngine.ts`, couverte par tests |
| Schéma de workspace Zod v2 | `projectSyncStore.test.ts`, 4 tests réussis |
| Rejet de sortie physique dans le snapshot | test frontend + endpoint local vérifié en `422` |
| Contrats de sécurité frontend | 9 tests `aircraftControlBoundary` + 6 tests `hardwareControl` |
| Formules de calcul locales | tests `aeroEngine`, `flightEngineering`, `virtualTestBench`, etc. |
| Endpoints santé et SITL | vérifiés en exécution avec `TestClient` |
| Hôte autorisé | un hôte non configuré est refusé en `400`, `localhost` accepté |
| Création de tables déclarées au démarrage | `lifespan` FastAPI et import vérifiés |
| Protection propriétaire dans les routes REST métier | `user_id` et vérification de projet présentes dans `business_api.py` |
| Verrouillage hardware serveur | `feature_enabled()` retourne toujours `False`; routes arm/command refusées |

### 4.2 Partiellement opérationnelles

| Fonction | État réel | Manque de preuve |
| --- | --- | --- |
| Création/sauvegarde projet authentifié | Routes SQL et bridge partiels présents | Pas de test E2E avec session OIDC réelle |
| Synchronisation multi-onglets | `BroadcastChannel` + timestamp + Zod présents | Pas de test navigateur multi-onglets complet |
| Simulation vers hall d’essais | partage de `config` et `simulation` par props | Résultats du hall non persistés dans `Simulation`/`LabSession` |
| Simulation vers rapport | génération locale Markdown et mutation `reports.create` | lecture `reports.list/get` incomplète côté bridge |
| Historique versions | composants et appels frontend présents | `designVersions.list` retourne systématiquement `[]`; restore non mappé |
| Analyse IA | endpoint FastAPI `/api/copilot/chat` réel si clé présente | Home appelle `trpc.ai.chat`, absent du bridge |
| Calcul aérodynamique | estimation NACA 4 chiffres déterministe dans `engineering_extensions.py` | ce n’est pas une CFD et aucun benchmark physique n’est fourni |
| LabBench | code frontend et fallback local présents | plusieurs mutations tRPC non implémentées dans FastAPI |
| Thèmes Studio Pro / Avionics / Blueprint | champs et CSS présents | absence de matrice de tests visuels automatisés sur les trois modules |
| Export de dossiers | exports JSON/CSV/OpenSCAD/Markdown côté frontend | pas de validation de réimport ni de signature durable |

### 4.3 Visuelles ou simulées uniquement

- **VirtualSimulationCenter :** scène, trajectoire, altitude, vitesse, courbes et anomalies sont produits par état React, fonctions mathématiques locales et valeurs synthétiques. Le composant affiche explicitement `SYNTHÉTIQUE`, `CALCUL LOCAL` et des environnements fictifs.
- **VirtualFlightTestHall :** scène de hangar, obstacles, zones de sécurité, trajectoire attendue/réelle, timeline et télémétrie sont illustratifs. Le code affiche `ILLUSTRATIVE SIMULATION`, `3D SYNTHÉTIQUE`, `CALCUL SYNTHÉTIQUE` et précise qu’aucune collision physique n’est calculée.
- **DroneSketchProWorkbench :** outil de dessin et de prototypage interactif avec strokes, calques, symétrie, gradients et mouvement virtuel. Les données du croquis sont des métadonnées de conception ; elles ne constituent pas une géométrie CAO exportée vers un solveur.
- **Jumeau numérique :** représenté visuellement par des paramètres et une maquette ; aucune calibration sur mesures réelles détectée.
- **Environnement météo/terrain :** choix d’options synthétiques, sans coordonnées ni données météorologiques externes.
- **IA sans clé externe :** fallback local/rules-only prévu.
- **CFD :** `/api/ops/cfd/prepare` prépare une quarantaine ; il ne lance pas de solveur. L’endpoint explicitement renvoie `blocked_runtime` si OpenFOAM est absent.
- **SITL :** contrat de métadonnées safe-python, sans connexion MAVLink et sans écriture télémétrique.
- **Certificate d’évidence :** signature Ed25519 interne en mémoire, non réglementaire et non durable.

### 4.4 Absentes ou non démontrées

- Moteur CFD OpenFOAM exécuté et vérifié.
- Moteur 6-DOF/physique de vol validé.
- Collision detection physique ou modèle d’obstacles calibré.
- Jumeau numérique calibré sur banc de mesures.
- Persistance complète des scénarios du VirtualSimulationCenter et des runs du VirtualFlightTestHall.
- Comparaison de versions réellement alimentée par une table de versions dans le bridge actuel.
- Lecture et détail de rapports via le bridge tRPC actuel.
- Journal d’audit complet via tRPC côté FastAPI actuel.
- Fonctionnalités LabBench `runSimulation`, `persistSimulation`, `seedRegistry`, `validateCommand` effectivement traitées par le bridge FastAPI.
- Test E2E navigateur couvrant le parcours créer → dessiner → simuler → essais → rapport.
- Déploiement Docker effectivement construit dans cet environnement, car Docker n’est pas installé.
- Observabilité production (métriques, traces, alertes, corrélation de requêtes) complète.

## 5. Échanges de données entre les trois modules

### Flux confirmé dans le frontend

1. `Home` conserve `config`, `project`, `requirements` et `runId` dans l’état React.
2. L’atelier modifie `ConceptConfig` et `customSketch` via `setConfig`.
3. `VirtualSimulationCenter` reçoit `config`, `simulation`, `history` et `versions`.
4. `VirtualFlightTestHall` reçoit `config`, `simulation` et `requirements`.
5. Le retour du hall vers le centre est un changement de vue via `onOpenBuilder`; il ne s’agit pas d’un enregistrement de résultat de campagne.
6. Le snapshot local Zod impose `physicalOutputEnabled: false` et peut être propagé via `BroadcastChannel`.

### Limites du contrat de données

- Le hall possède un compteur local `runs`, mais aucun identifiant de run persisté dans `ProjectRecord` n’est créé par ce composant.
- Le centre peut relancer le moteur local et afficher des historiques serveur si disponibles, mais la branche FastAPI `designVersions.list` renvoie `[]` et plusieurs opérations historiques n’existent pas.
- Le nom du prototype repose sur des champs libres (`designName`, `platformProfile`) ; aucun type backend commun et versionné ne relie explicitement atelier, simulation et hall.
- La création de projet via le bridge ajoute des valeurs par défaut et conserve de larges dictionnaires JSON, sans schéma serveur équivalent au schéma Zod frontend.
- `api/local/workspace` conserve les snapshots dans `_local_workspaces`, dictionnaire mémoire : redémarrage de processus ou scaling horizontal = perte du snapshot local côté serveur.

## 6. IA, calculs physiques et stockage réellement exécutés

### IA

Le backend `web/copilot.py` effectue réellement un appel HTTP vers `OPENAI_API_BASE/chat/completions` lorsque `OPENAI_API_KEY` est présente, avec timeout de 30 secondes. Sans clé, il retourne une réponse `rules-only`. La capacité détectée lors du test `/api/capabilities` indiquait `llm: true` dans l’environnement d’audit, mais cette capacité n’a pas été testée par une conversation authentifiée réelle.

Le problème bloquant est l’intégration : le frontend utilise `trpc.ai.chat`, alors que `web/app.py` ne traite que `ai.status` dans le bridge. Une procédure inconnue reçoit actuellement une enveloppe `data: null`, ce qui ne constitue pas un contrat d’erreur explicite.

### Calculs physiques

- `aeroEngine.ts` : calcul déterministe local d’énergie, masse, endurance, marges et métriques ; opération mathématique vérifiable, pas preuve physique.
- `engineering_extensions.py` : génération NACA et estimation `Cl/Cd` préliminaire ; le code documente lui-même ses limitations et ne remplace pas OpenFOAM.
- `/api/ops/cfd/prepare` : préparation isolée uniquement, aucune exécution constatée.
- `VirtualSimulationCenter` et `VirtualFlightTestHall` : visualisation et animation illustrative.

### Stockage

- SQLite local ou PostgreSQL déclaré via SQLAlchemy.
- Tables créées automatiquement avec `create_all`; absence de migration versionnée vérifiable.
- Projets, drones, simulations et rapports ont des tables, mais la couverture réelle dépend du chemin REST/tRPC utilisé.
- Workspace anonyme côté backend : mémoire de processus uniquement.
- Frontend : localStorage et BroadcastChannel fonctionnels pour le navigateur, mais concurrence et reprise après crash ne sont pas couvertes par un test navigateur.

## 7. Anomalies et risques classés par gravité

### Critiques — bloquants avant production

**Aucune vulnérabilité critique confirmée dans le chemin N2 audité.** La sortie matérielle est désactivée côté serveur (`feature_enabled() -> False`) et les tests frontend rejettent armement, écriture d’actionneur et téléversement de mission.

### Haute priorité — P1

#### P1-01 — Contrat tRPC incomplet et réponses silencieuses

**Preuve :** le frontend appelle `ai.chat`, `auditEvents.record`, `auditEvents.list`, `designVersions.restore`, `labBench.persistSimulation`, `labBench.runSimulation`, `labBench.seedRegistry`, `labBench.validateCommand`, `reports.get` et `reports.list`. Ces procédures ne disposent pas toutes d’une branche dans `web/app.py`. Le fallback final renvoie `data: null` au lieu d’une erreur `404`.

**Impact :** fonctions affichées comme disponibles mais non exécutées ou non persistées ; risque de faux positif fonctionnel.

**Correction :** supprimer le bridge générique silencieux ; définir un contrat versionné explicite ou implémenter chaque procédure avec tests d’intégration.

#### P1-02 — Persistance locale serveur non durable

**Preuve :** `_local_workspaces: dict[str, dict] = {}` dans `web/app.py`.

**Impact :** perte à chaque redémarrage et incohérence en multi-instance.

**Correction :** stocker les snapshots locaux dans une table dédiée, ou limiter clairement le service à la persistance navigateur et supprimer l’écriture serveur trompeuse.

#### P1-03 — Authentification non configurée dans l’environnement vérifié

**Preuve :** `/api/health` retourne `oidc: not_configured`; les routes projet retournent `401 OIDC authentication required` sans session.

**Impact :** impossible de démontrer la persistance authentifiée, les historiques et les rapports en production depuis cet environnement.

**Correction :** configurer un fournisseur OIDC de test, réaliser un parcours E2E authentifié, vérifier redirections, audience, issuer, nonce, expiration et révocation.

#### P1-04 — Absence de migration versionnée

**Preuve :** démarrage via `Base.metadata.create_all(bind=engine)` ; aucune migration Alembic/équivalente trouvée dans l’inventaire.

**Impact :** évolution destructive de schéma non contrôlée et risque de divergence SQLite/PostgreSQL.

**Correction :** adopter Alembic ou outil équivalent, versionner les schémas, tester upgrade/downgrade et supprimer la dépendance à `create_all` en production.

### Moyenne priorité — P2

#### P2-01 — Bundle initial très lourd

**Preuve :** bundle JS principal ~2.06 MB, CSS principal ~590 KB, avec de nombreux chunks de langages, Mermaid/Cytoscape et HLS ; `Home.tsx` fait 12 956 lignes et `index.css` 14 960 lignes.

**Impact :** temps de chargement, mémoire et interaction dégradés sur 375 px et appareils faibles.

**Correction :** routes/modules en `import()` dynamique, découpage de `Home.tsx`, chargement différé de Mermaid, Cytoscape, HLS et éditeurs, budgets Lighthouse mesurables.

#### P2-02 — Pas de tests backend automatisés

**Preuve :** 25 fichiers de tests frontend trouvés ; aucun `test_*.py` trouvé dans le périmètre applicatif.

**Impact :** contrats FastAPI, isolation propriétaire, OIDC, database et garde-fous serveur non régressés automatiquement.

**Correction :** ajouter pytest/TestClient, tests de permissions, migrations, routes inconnues, mode N2 et contrat d’erreurs.

#### P2-03 — Fallback Bearer annoncé côté client mais non consommé côté serveur

**Preuve :** `main.tsx` extrait `manus-cookie` et envoie un header `Authorization: Bearer ...` en fallback ; `current_user()` et les dépendances backend lisent uniquement le cookie `aeromind_session`.

**Impact :** les environnements où les cookies iframe sont bloqués peuvent rester non authentifiés malgré le fallback affiché.

**Correction :** soit supprimer ce fallback, soit implémenter une validation Bearer strictement équivalente et documentée, avec tests anti-confusion cookie/Bearer.

#### P2-04 — État opérationnel et contrôleurs en mémoire

**Preuve :** `_STATE` dans `operational_state.py` et `_controllers` dans `hardware_api.py` sont des dictionnaires de processus.

**Impact :** redémarrage ou scaling perd l’état ; les décisions opérationnelles ne sont pas auditables durablement.

**Correction :** persister les transitions et receipts dans un journal append-only ; réinitialiser explicitement en état sûr après redémarrage.

#### P2-05 — Vérification Docker non réalisée

**Preuve :** `docker` et `docker compose` ne sont pas installés dans le sandbox.

**Impact :** Dockerfile et Compose sont plausibles mais non prouvés construisibles ici.

**Correction :** exécuter en CI `docker build`, `docker compose config`, démarrage Postgres, healthcheck et smoke tests.

#### P2-06 — Dépendances candidates et dette de scaffold

Le package frontend déclare un volume important de bibliothèques. Une revue exhaustive d’utilisation n’a pas été assimilée à une preuve de suppression sûre. Plusieurs dépendances sont des candidates au nettoyage (intégrations S3/SQL/Express ou composants UI non visibles dans les imports ciblés), mais elles doivent être vérifiées par graphe de build avant action.

`pip check` signale aussi dans l’environnement global :

```text
pyhanko 0.37.0 requires cryptography>=48.0.0, but cryptography 46.0.3 is installed
pyhanko-certvalidator 0.32.1 requires cryptography>=48.0.0, but cryptography 46.0.3 is installed
```

Ce conflit ne vient pas directement des dépendances déclarées par `requirements.txt`, mais il doit être isolé par un environnement virtuel propre en CI.

### Faible priorité — P3

- Les clés de signature d’évidence sont générées en mémoire au démarrage et ne sont pas conservées dans un coffre ; les documents ne sont donc pas vérifiables après redémarrage.
- Aucun système de métriques, traces distribuées ou correlation ID persistant n’a été démontré.
- Les résultats du hall sont principalement de l’état React local ; l’historique de campagne n’est pas une preuve serveur.
- Les warnings Vite indiquent des chunks >500 KB, notamment le bundle principal.
- Le contrat frontend Zod autorise `.passthrough()` sur plusieurs objets, ce qui protège l’intégrité minimale mais laisse des champs non normalisés circuler.

## 8. Sécurité

### Mesures positives constatées

- Secret de session obligatoire et longueur minimale de 32 octets.
- Cookie `HttpOnly`, `Secure` en production et `SameSite=None` pour le preview HTTPS.
- Validation HMAC de la session et validation OIDC JWT au callback.
- Vérification de `state`, `nonce`, PKCE et durée d’expiration du state OIDC.
- `TrustedHostMiddleware`.
- Headers `nosniff`, `DENY`, `no-referrer`, `Permissions-Policy`, HSTS en production.
- Isolation propriétaire dans les routes REST et tRPC projet principales.
- Sortie hardware désactivée en dur dans le chemin actuel.
- Rejet du snapshot si `physicalOutputEnabled` vaut `true`.

### Points à renforcer

- Établir une matrice de tests d’autorisation pour toutes les routes, pas seulement pour le frontend.
- Ajouter CSRF explicite si le produit conserve des mutations cookie-auth cross-site ; `SameSite=None` augmente la nécessité d’un mécanisme CSRF dédié.
- Remplacer la réponse `data: null` des procédures inconnues par une erreur structurée.
- Définir une vraie politique de rotation/révocation des sessions signées.
- Ne jamais laisser `AEROMIND_ALLOWED_HOSTS` ou CORS être configurés par une valeur trop large en production.
- Retirer ou isoler les variables hardware déclarées dans le déploiement tant que le code reste N2-only, afin de réduire l’ambiguïté opérationnelle.

## 9. Performance et qualité

### Constats

- Principal bundle JS : environ **2.06 MB**.
- CSS principal : environ **590 KB**.
- Image de simulation : environ **869 KB**.
- `Home.tsx` : **12 956 lignes**.
- `index.css` : **14 960 lignes**.
- `aeromind-dynamics.css` : **1 715 lignes**.
- 38 fichiers de composants dans le répertoire principal.

### Risques

- Hydratation/initialisation de nombreux hooks et requêtes même lorsque la fenêtre correspondante n’est pas ouverte.
- Coût inutile des éditeurs et visualisations lourdes dans le chargement initial.
- Maintenance et revue de sécurité difficiles dans un composant Home monolithique.
- Risque de divergence entre les anciens composants `DroneSketchWorkbench`/`DroneSketchProWorkbench` et les multiples vues d’assemblage.

## 10. Déploiement et redéploiement

### Ce qui est présent

- `Dockerfile` multi-stage Node → Python.
- `docker-compose.yml` avec PostgreSQL, healthcheck et volume.
- `render.yaml` avec service web, base PostgreSQL et variables d’environnement.
- Uvicorn sur `0.0.0.0:${PORT}`.
- `/api/ready` configuré comme healthcheck.
- Build frontend réussi hors Docker.
- Import FastAPI réussi et TestClient démarrable.

### Ce qui reste non vérifié

- Build Docker réel, car la commande `docker` est absente du sandbox.
- Migration d’un schéma existant vers PostgreSQL.
- Authentification Entra/OIDC complète avec variables réelles.
- Persistance après redémarrage et en multi-instance.
- Smoke test Render ou environnement staging.
- Compatibilité de l’image finale avec tous les assets requis.

## 11. Plan de correction priorisé

### Phase 0 — Bloquer les faux positifs fonctionnels

1. Faire répondre `404 PROCEDURE_NOT_IMPLEMENTED` pour tout tRPC non mappé.
2. Construire la matrice frontend-procédure-backend et la faire échouer en CI si une procédure manque.
3. Marquer dans l’interface les écritures non persistées comme « aperçu local ».
4. Maintenir N2 verrouillé et ajouter un test serveur de non-activation même avec variables hardware présentes.

### Phase 1 — Rendre l’intégration cohérente

1. Implémenter ou retirer explicitement `ai.chat`, rapports lecture/détail, versions, audit et LabBench.
2. Définir un contrat `PrototypeSnapshot v1` partagé backend/frontend : identifiant, version, config, sketch, scénario, run, provenance et evidence level.
3. Persister les runs du hall et du centre dans `Simulation`/`LabSession` avec un `run_id` et une version de prototype.
4. Ajouter les tests d’intégration FastAPI avec fixture session, projet, drone, simulation et rapport.
5. Remplacer `_local_workspaces` par stockage durable ou supprimer l’illusion de stockage serveur local.

### Phase 2 — Industrialiser la donnée et l’authentification

1. Ajouter Alembic et migrations testées.
2. Tester OIDC staging réel, claims, rotation, logout, session expirée et accès propriétaire.
3. Décider formellement si le fallback Bearer est supporté ; l’implémenter ou le retirer.
4. Ajouter CSRF et politique de cookies documentée.
5. Mettre en place journaux d’audit persistants et correlation IDs.

### Phase 3 — Performance et simulation

1. Découper `Home.tsx` par domaine.
2. Lazy-loader centre simulation, hall, LabBench, Mermaid/Cytoscape/HLS.
3. Ajouter budgets : JS initial gzip < 400 KB, CSS initial gzip < 120 KB, LCP < 2,5 s sur profil mobile simulé.
4. Remplacer les noms « calcul local » par un niveau de preuve explicite dans chaque métrique.
5. Si nécessaire, brancher un moteur physique/CFD réel derrière un worker isolé, avec provenance, version moteur, timeout et stockage des inputs/outputs.

## 12. Feuille de route de mise en production et critères d’acceptation

### Gate A — Build et démarrage

- `pnpm --dir frontend check` : exit code 0.
- `pnpm --dir frontend test` : 100 % des tests passants.
- `pnpm --dir frontend build` : exit code 0, aucun import critique manquant.
- `docker build` : succès reproductible en CI.
- `/api/ready` : HTTP 200 avec base connectée.

### Gate B — Contrats API

- Chaque procédure tRPC appelée par le frontend est mappée ou explicitement retirée.
- Une procédure inconnue retourne HTTP 404 avec `PROCEDURE_NOT_IMPLEMENTED`, jamais `data: null`.
- Tests backend de routes : projets, drones, simulations, rapports, audit, versions, permissions.
- Test cross-user : aucun utilisateur ne lit ou ne modifie le projet d’un autre.

### Gate C — Parcours utilisateur

Sur un environnement staging OIDC configuré, le scénario suivant doit être automatisé :

1. authentification ;
2. création d’un projet ;
3. sélection d’un prototype ;
4. modification d’un croquis ;
5. sauvegarde et relecture après refresh ;
6. lancement du run de simulation ;
7. ouverture du hall ;
8. exécution du scénario reproductible ;
9. persistance du résultat avec le même `prototype_id`, `version` et `run_id` ;
10. génération et relecture du rapport ;
11. retour atelier et création d’une version suivante.

**Critère :** 10 parcours consécutifs réussis, sans `data: null`, sans perte de données et avec les identifiants cohérents.

### Gate D — Sécurité N2

- Tests serveur garantissant `hardware_control=false`, `mission_upload=false`, `telemetry_write=false`.
- N3/N4 refusés sans preuves et approbations requises.
- Aucune trame MAVLink, écriture actionneur ou téléversement dans les logs d’intégration.
- Test de non-régression avec variables hardware présentes : le système reste N2.

### Gate E — Données et reprise

- Migration PostgreSQL depuis une base vide et une base existante.
- Redémarrage de l’application sans perte de projets, runs, rapports ou audit.
- Deux instances applicatives partageant la même base sans divergence de workspace.
- Backup/restauration vérifiés sur un jeu de données de référence.

### Gate F — Performance

- LCP mobile < 2,5 s, INP < 200 ms sur un profil mobile de référence.
- JS initial gzip < 400 KB et CSS initial gzip < 120 KB, ou justification approuvée.
- Ouverture des modules lourds par chargement différé.
- Pas de fuite d’intervalle, WebSocket ou `BroadcastChannel` lors de 20 ouvertures/fermetures successives.

## 13. Conclusion

AeroMind possède une base crédible pour un **cockpit de démonstration d’ingénierie N2** : l’architecture FastAPI/React est bootable, le store local est validé, les garde-fous hardware sont sérieux et les trois espaces sont visuellement présents.

La priorité n’est pas d’ajouter davantage d’effets 3D. Elle est de rendre les contrats vérifiables : **une procédure frontend doit exister côté backend, une écriture affichée comme persistée doit être relue après redémarrage, un run du hall doit avoir un identifiant durable, et une sortie IA/physique doit déclarer sa provenance exacte**.

**Décision d’audit :** accepter pour démonstration interne N2 et développement continu ; refuser la déclaration « entièrement opérationnelle full-stack » et la mise en production tant que les anomalies P1 ne sont pas corrigées et que les Gates A à F ne sont pas satisfaites.
