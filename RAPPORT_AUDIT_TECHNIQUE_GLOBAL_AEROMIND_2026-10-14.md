# AeroMind — Audit technique global et indépendant

**Date de l’audit :** 14 octobre 2026  
**Périmètre :** dépôt `/home/ubuntu/work_aeromind`, frontend compilé, backend FastAPI, contrats API, sécurité, persistance, synchronisation, garde-fous de contrôle, aperçu public.  
**Méthode :** inspection statique, exécution des validations disponibles, tests de démarrage, smoke test HTTP, smoke test navigateur et contrôle des incohérences entre documentation et fichiers livrés.

## 1. Conclusion exécutive

### Verdict

> **AeroMind n’est pas entièrement opérationnel comme produit full-stack dans l’état audité.**

Le **frontend local statique** est en bon état de compilation : typage réussi, 25 fichiers de tests et 131 tests réussis, build Vite réussi, interface publiée accessible et console navigateur sans erreur au chargement.

En revanche, le **système complet** présente des blocages critiques :

1. Le backend FastAPI ne s’importe pas dans l’environnement audité à cause de dépendances Python absentes.
2. Après installation de ces dépendances, l’import resterait bloqué par des modules applicatifs absents du dépôt (`sitl_modules`, `main.py`, et adaptateur `hardware`).
3. Aucun fichier de dépendances Python, migration, Dockerfile, Compose, Render ou CI annoncé dans la documentation n’est présent dans l’archive auditée.
4. Les scripts Node `start` et `dev:api` ciblent des fichiers absents.
5. L’aperçu public est servi par un serveur statique et renvoie `404` sur tous les endpoints `/api/*` testés : il s’agit donc d’un aperçu frontend, pas d’une instance full-stack opérationnelle.
6. La couverture de tests est principalement unitaire. Les flux E2E annoncés précédemment — authentification, F5, deux onglets, API réelle, CRUD BDD et parcours complet — ne sont pas exécutés automatiquement.

### Classification globale

| Domaine | État | Niveau |
|---|---|---:|
| Compilation frontend | Fonctionnel | Vert |
| Tests unitaires frontend | Fonctionnel | Vert |
| Démarrage de l’interface statique | Fonctionnel | Vert |
| Démarrage backend FastAPI | Bloqué | Critique |
| API métier réelle | Non démontrée / indisponible dans l’aperçu | Critique |
| Authentification OIDC réelle | Non démontrée | Élevé |
| Persistance BDD serveur | Non démontrée | Élevé |
| Synchronisation locale | Implémentée et testée au niveau unitaire | Jaune |
| Garde-fous matériel | Présents et fortement restrictifs | Vert sécurité |
| Déploiement reproductible | Non reproductible depuis l’archive | Critique |
| Tests E2E / intégration | Absents | Élevé |

## 2. Preuves d’exécution

### 2.1 Frontend

Commandes exécutées dans `frontend/` :

```text
pnpm run check
→ exit 0
→ tsc --noEmit

pnpm test -- --run
→ Test Files 25 passed (25)
→ Tests 131 passed (131)
→ exit 0

pnpm run build
→ build Vite réussi
→ exit 0
```

Le build produit toutefois un avertissement de performance : le chunk principal dépasse 3 Mo minifié, avec plusieurs chunks supérieurs à 500 Ko.

### 2.2 Backend Python

```text
python3 -m py_compile web/*.py
→ réussi
```

La compilation syntaxique seule ne garantit pas l’importabilité. L’import réel échoue :

```text
import web.app
→ ModuleNotFoundError: No module named 'httpx'
```

Les modules testés ont donné :

| Dépendance | Résultat |
|---|---:|
| fastapi | présente |
| pydantic | présente |
| numpy | présente |
| uvicorn | présente |
| httpx | absente |
| sqlalchemy | absente |
| jwt / PyJWT | absente |

Même après installation des dépendances absentes, l’import de `web.app` rencontrera au minimum :

```text
from sitl_modules.api import router as sitl_router
```

Or `sitl_modules/` est absent du dépôt.

### 2.3 Smoke test navigateur

L’aperçu public démarre correctement :

- titre : `AeroMind AI — Cockpit d’ingénierie` ;
- interface et navigation initiale visibles ;
- état vierge affiché honnêtement ;
- simulation désarmée ;
- console navigateur : **aucune sortie d’erreur** au chargement.

Le clic sur **Créer manuellement** est correctement bloqué lorsque le SSO n’est pas configuré, avec le message :

> Connexion Microsoft / SSO obligatoire avant de créer un projet.

Ce comportement est cohérent avec le modèle de sécurité attendu.

### 2.4 Smoke test HTTP de l’aperçu public

URL inspectée :

`https://4173-itfutxwuiis6ycmwt2j4m-749e2a99.us4.manus.computer/`

Résultats :

| URL | Résultat |
|---|---:|
| `/` | HTTP 200, HTML frontend |
| `/api/health` | HTTP 404 |
| `/api/capabilities` | HTTP 404 |
| `/api/platform/config.js` | HTTP 404 |
| `/api/auth/oidc/me` | HTTP 404 |
| `/api/local/workspace` | HTTP 404 |

**Interprétation :** l’aperçu actuel est un serveur statique de `frontend/dist`. Il ne sert pas le backend FastAPI et ne peut donc pas démontrer les fonctionnalités serveur, OIDC, projets persistants, rapports persistants, contrôle opérationnel ou API métier.

## 3. Constats critiques

### AUD-CRIT-01 — Backend non démarrable depuis l’archive

**Preuve :**

- `httpx`, `sqlalchemy` et `jwt` ne sont pas disponibles dans l’environnement ;
- aucun `requirements.txt`, `requirements-dev.txt` ou `pyproject.toml` n’est présent ;
- `web.app` importe aussi `sitl_modules.api`, module absent.

**Impact :** impossible de lancer l’API FastAPI avec la procédure documentée. Les routes métier, OIDC, BDD, LabBench et contrôle serveur ne sont pas vérifiables ni exploitables depuis l’archive seule.

**Sévérité : Critique.**

### AUD-CRIT-02 — Modules applicatifs référencés absents

Références identifiées :

- `web/app.py` → `sitl_modules.api` ;
- `web/app.py` → `main.AeroMindAI` dans `_engine_status()` ;
- `web/hardware_api.py` → `hardware.control_link` et `hardware.control_service` si un chemin matériel était appelé.

Éléments absents :

- `sitl_modules/` ;
- `main.py` ;
- `hardware/` ;
- tout packaging correspondant.

**Impact :** incohérence entre l’API annoncée et le contenu livré. Le mode matériel est correctement bloqué, mais le serveur n’est pas assemblable comme application complète.

**Sévérité : Critique pour le démarrage, élevée pour l’intégration.**

### AUD-CRIT-03 — Déploiement non reproductible

La documentation annonce des éléments qui ne sont pas présents :

- `migrations/` ;
- `alembic.ini` ;
- `Dockerfile` ;
- `docker-compose.yml` ;
- `render.yaml` ;
- `Makefile` ;
- `RUNBOOK.md` ;
- workflows `.github/`.

**Impact :** la procédure README ne peut pas être exécutée à partir de l’archive. Il n’existe pas de preuve reproductible de migration BDD, déploiement ou CI.

**Sévérité : Critique.**

### AUD-CRIT-04 — Scripts frontend incohérents

`frontend/package.json` annonce :

```json
"start": "NODE_ENV=production node dist/index.js",
"dev:api": "PORT=${AEROMIND_API_PORT:-3001} NODE_ENV=development tsx watch server/_core/index.ts"
```

Mais :

- `frontend/dist/index.js` n’existe pas ;
- `frontend/server/_core/index.ts` n’existe pas ;
- seul `frontend/server/routers.ts` est présent côté serveur Node.

Tests exécutés :

```text
pnpm run start
→ MODULE_NOT_FOUND: frontend/dist/index.js

pnpm run dev:api
→ ERR_MODULE_NOT_FOUND: frontend/server/_core/index.ts
```

**Impact :** les scripts de démarrage documentés côté Node sont cassés. Le frontend ne fonctionne actuellement qu’en build statique servi par un serveur HTTP externe ou par une intégration backend distincte.

**Sévérité : Critique pour la mise en production, élevée pour le développement.**

### AUD-CRIT-05 — Aperçu public non full-stack

Le HTML d’entrée contient :

```html
<script src="/api/platform/config.js"></script>
```

Mais l’aperçu statique renvoie `404` sur ce fichier ainsi que sur toutes les routes API testées.

**Impact :** l’interface peut s’afficher, mais les fonctions suivantes ne sont pas démontrées depuis l’URL :

- connexion OIDC ;
- création et synchronisation de projets serveur ;
- persistance distante ;
- rapports et simulations persistés ;
- LabBench serveur ;
- capacités et état backend ;
- contrôle serveur en lecture seule ;
- préparation CFD protégée.

**Sévérité : Critique si cette URL est présentée comme version opérationnelle complète.**

## 4. Constats fonctionnels par domaine

### 4.1 Frontend et interface — état : partiellement opérationnel

**Points confirmés :**

- l’application se charge ;
- les menus principaux sont présents ;
- le workspace vierge est explicitement signalé ;
- aucune création automatique trompeuse n’est effectuée ;
- le parcours de création exige bien une authentification lorsque le serveur le signale comme non configuré ;
- le workbench R1–R6 compile et dispose de tests de schéma/mutation ;
- l’interface RENDU a été inspectée dans le navigateur et le Studio maximisé occupe correctement la largeur utile.

**Limites :**

- aucun projet ne peut être créé dans le smoke test public sans SSO ;
- aucune sélection de modèle n’a été validée de bout en bout jusqu’à persistance serveur ;
- aucun test automatisé de clic/navigation n’est présent ;
- les chemins API du frontend échouent sur l’aperçu statique.

### 4.2 Simulation locale — état : fonctionnel au niveau frontend, non certifié système

Le moteur local et la simulation virtuelle sont couverts par plusieurs tests unitaires. Le code distingue correctement :

- simulation ;
- HIL / lecture seule ;
- sortie matérielle interdite.

Cependant, l’audit n’a pas pu démontrer :

- l’exécution depuis le backend déployé ;
- la cohérence avec une BDD réelle ;
- la persistance des runs ;
- l’intégration avec une identité OIDC réelle ;
- les performances sous charge.

Les résultats restent des calculs préliminaires et documentaires, ce que l’interface indique correctement.

### 4.3 Persistance et synchronisation — état : partiellement fonctionnel

**Points confirmés par le code et les tests :**

- enveloppe de workspace versionnée ;
- validation Zod ;
- migration de snapshots legacy ;
- statuts `LOCAL`, `SERVER-ACK`, `PENDING SYNC`, `ERROR` ;
- résolution par horodatage pour les snapshots inter-onglets ;
- `physicalOutputEnabled` forcé à `false` ;
- route frontend prévue pour `/api/local/workspace`.

**Limites bloquantes :**

- la route `/api/local/workspace` n’est pas disponible sur l’aperçu public ;
- la persistance distante réelle dépend d’un backend qui ne démarre pas dans l’archive ;
- aucune suite E2E F5 / deux onglets / reprise après corruption n’a été exécutée dans un vrai navigateur automatisé ;
- le workspace local du backend est stocké dans `_local_workspaces`, un dictionnaire mémoire : il est perdu au redémarrage et n’est pas une persistance durable ;
- les migrations BDD annoncées sont absentes.

### 4.4 Authentification et autorisation — état : non démontré en intégration

**Points positifs du code :**

- secret de session validé à au moins 32 octets ;
- validation OIDC avec state signé, nonce et PKCE ;
- cookie de session `HttpOnly` ;
- cookie sécurisé en environnement non développement ;
- vérification d’audience et d’émetteur du jeton ID ;
- séparation utilisateur / super-administrateur via liste de secrets ;
- les routes métier demandent une session.

**Points non vérifiés :**

- découverte OIDC réelle ;
- callback fournisseur ;
- rotation/expiration en conditions réelles ;
- contrôle d’accès avec plusieurs identités ;
- vérification des droits propriétaire sur une BDD réellement migrée ;
- configuration CORS et TrustedHost sur domaine de production.

**Point à surveiller :** le fallback local de `BaseSettings` existe pour compenser une image incomplète, mais la dépendance standard `pydantic-settings` n’est pas déclarée dans un fichier de dépendances livré. Cette tolérance masque potentiellement un environnement mal packagé au lieu de l’échouer explicitement.

### 4.5 Contrôle matériel et sécurité opérationnelle — état : garde-fou présent, fonctionnalité matériel volontairement désactivée

Le contrôle matériel présente une posture de sécurité conservatrice :

- `feature_enabled()` renvoie toujours `False` ;
- `arm`, `command` et le passage en mode matériel sont rejetés ;
- `mission-upload` est absent des capacités opérationnelles ;
- `physicalOutputEnabled` est conservé à `false` ;
- l’armement virtuel est explicitement limité à la simulation locale ;
- l’arrêt d’urgence en simulation ne charge pas d’adaptateur physique.

**Conclusion importante :** AeroMind est opérationnel comme cockpit de simulation/documentation, **pas comme système de contrôle aéronef réel**. Cette limitation est actuellement cohérente avec le code et doit rester explicitement communiquée.

### 4.6 Performance et maintenabilité — état : risque élevé

Indicateurs observés :

- `Home.tsx` : environ 511 Ko ;
- `DesignStudioView.tsx` : environ 74 Ko ;
- `ComponentShowcase.tsx` : environ 58 Ko ;
- 158 fichiers TypeScript/TSX ;
- 14 fichiers Python ;
- 26 fichiers de tests détectés, dont 25 fichiers frontend exécutés dans le résumé Vitest.

Le build signale un chunk principal d’environ 3 Mo minifié et plusieurs chunks dépassant 500 Ko.

**Risques :**

- temps de chargement initial élevé ;
- maintenance difficile dans `Home.tsx` monolithique ;
- couplage fort entre vues, simulation, persistance, opérations et rendu ;
- probabilité accrue de régressions lors de modifications ciblées ;
- absence de séparation claire entre code de démonstration, code métier et intégration serveur.

## 5. Matrice de tests et de couverture

| Contrôle | Résultat | Portée réelle |
|---|---:|---|
| `python3 -m py_compile web/*.py` | Réussi | Syntaxe seulement |
| Import `web.app` | Échec | Dépendance `httpx` absente |
| Présence dépendances backend | Échec | Aucun manifeste Python livré |
| `pnpm run check` | Réussi | TypeScript |
| Vitest | 25 fichiers / 131 tests réussis | Unitaire frontend |
| `pnpm run build` | Réussi | Bundle statique |
| `pnpm run start` | Échec | Entrée `dist/index.js` absente |
| `pnpm run dev:api` | Échec | Entrée `server/_core/index.ts` absente |
| HTTP `/` aperçu | HTTP 200 | Frontend statique |
| HTTP `/api/health` aperçu | HTTP 404 | Backend absent |
| HTTP `/api/platform/config.js` aperçu | HTTP 404 | Runtime config absent |
| Console navigateur | Aucune erreur au chargement | Smoke test initial |
| Création projet sans SSO | Bloquée correctement | Garde-fou auth visible |
| OIDC réel | Non exécuté | Secrets/config fournisseur absents |
| CRUD BDD réel | Non exécuté | Backend non démarrable |
| Deux onglets / F5 / corruption | Non exécuté en E2E | Tests unitaires seulement |
| Charge / performance | Non exécuté | Aucun scénario de charge |
| SITL | Non exécuté | Module `sitl_modules` absent |
| Docker/Compose/CI | Non exécutable | Fichiers absents |

## 6. Points positifs confirmés

1. **Le frontend compile proprement.**
2. **Les 131 tests frontend passent.**
3. **Les schémas RENDU et les garde-fous de synchronisation disposent d’une couverture unitaire réelle.**
4. **L’état vierge est affiché honnêtement et aucune création automatique de projet ou de modèle n’est imposée.**
5. **La simulation et l’armement virtuel sont explicitement séparés du matériel réel.**
6. **Les commandes physiques dangereuses sont structurellement rejetées dans cette version.**
7. **La sécurité HTTP de base du backend est prévue : TrustedHost, en-têtes de sécurité, CORS conditionnel et cookies sécurisés.**
8. **Le smoke test navigateur ne révèle pas d’erreur JavaScript au chargement.**

## 7. Plan de remédiation priorisé

### Priorité P0 — rendre le dépôt réellement démarrable

1. Ajouter un manifeste Python complet (`requirements.txt` ou `pyproject.toml`) avec versions verrouillées : FastAPI, Uvicorn, SQLAlchemy, driver PostgreSQL, httpx, PyJWT, cryptography, pydantic-settings et dépendances SITL réellement utilisées.
2. Ajouter ou réintégrer `sitl_modules/`, `main.py` et les modules référencés par l’API.
3. Ajouter les migrations BDD et le fichier de configuration Alembic réellement utilisés.
4. Corriger les scripts `start` et `dev:api` pour pointer vers des entrées existantes, ou supprimer les scripts obsolètes.
5. Choisir une architecture de déploiement unique : FastAPI sert-il le frontend, ou un serveur frontend distinct sert-il le frontend et reverse-proxy l’API ?
6. Tester une commande propre depuis un environnement vierge, sans dépendances préinstallées.

### Priorité P1 — rendre l’intégration vérifiable

1. Fournir Dockerfile, Compose de test, CI et procédure de migration cohérente avec le README.
2. Démarrer l’API et exécuter : `/api/health`, `/api/capabilities`, `/api/platform/config.js`, `/api/auth/oidc/status`.
3. Ajouter une base SQLite de test puis une base PostgreSQL de CI.
4. Ajouter des tests d’intégration FastAPI avec `TestClient`/`httpx`.
5. Ajouter un parcours OIDC simulé avec fournisseur de test.
6. Vérifier la séparation propriétaire entre deux utilisateurs.

### Priorité P1 — ajouter la couverture E2E

Couvrir au minimum :

- démarrage workspace vierge ;
- sélection catalogue → configuration → Studio → Inspecteur ;
- création projet authentifiée ;
- sauvegarde locale puis restauration F5 ;
- corruption de snapshot ;
- conflit entre deux onglets ;
- sélection R1–R6 ;
- changement thème et architecture RENDU ;
- génération de rapport ;
- rejet des commandes `arm`, `actuator-write`, `mission-upload` ;
- retour API en erreur et affichage `ERREUR DE SYNCHRONISATION`.

### Priorité P2 — qualité et performance

1. Découper `Home.tsx` en domaines autonomes.
2. Charger à la demande les modules lourds : Mermaid, HLS, composants 3D, pages d’administration et showcase.
3. Réduire le chunk initial et définir un budget bundle CI.
4. Ajouter ESLint, formatage et contrôle de complexité.
5. Ajouter une analyse d’accessibilité automatisée.
6. Ajouter des tests de performance et de non-régression visuelle du workbench RENDU.

## 8. Décision d’acceptation recommandée

### Ce qui peut être accepté maintenant

- **Prototype frontend de cockpit et simulation locale : oui**, sous réserve de l’étiquette prototype/documentaire.
- **Moteurs et garde-fous frontend : oui pour une revue de code**, pas pour une certification opérationnelle.
- **Aperçu visuel : oui**, en le présentant explicitement comme aperçu statique.

### Ce qui ne doit pas être déclaré opérationnel

- API FastAPI complète ;
- persistance BDD serveur ;
- authentification OIDC réelle ;
- déploiement Docker/Render ;
- SITL ;
- contrôle matériel ;
- génération de preuves officielles ;
- chaîne full-stack de bout en bout.

### Verdict final

> **AeroMind est un frontend de simulation/documentation compilable avec des garde-fous convaincants, mais l’archive auditée ne constitue pas encore une application full-stack entièrement opérationnelle et reproductible.**

La condition minimale avant de déclarer AeroMind « entièrement opérationnel » est de résoudre les quatre constats critiques `AUD-CRIT-01` à `AUD-CRIT-05`, puis d’exécuter une matrice d’intégration et E2E sur un environnement vierge.

## 9. Fichiers et preuves examinés

- `README.md`
- `.env.example`
- `frontend/package.json`
- `frontend/client/index.html`
- `frontend/client/src/main.tsx`
- `frontend/client/src/pages/Home.tsx`
- `frontend/client/src/components/AircraftRenderWorkbench.tsx`
- `frontend/client/src/lib/projectSyncStore.ts`
- `frontend/client/src/lib/aircraftRenderSchema.ts`
- `frontend/client/src/lib/aircraftControlBoundary.ts`
- `web/app.py`
- `web/config.py`
- `web/database.py`
- `web/oidc.py`
- `web/business_api.py`
- `web/hardware_api.py`
- `web/operational_state.py`
- rapports de diagnostic et de recette existants

**Rapport généré à partir de commandes d’audit réellement exécutées ; aucune conclusion d’intégration non vérifiée n’est présentée comme un succès.**
