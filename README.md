# AeroMind AI

Cockpit drone, API FastAPI, simulations et banc LabBench. Le mode de fonctionnement par défaut est **simulation**; le contrôle matériel réel est désactivé (`HARDWARE_CONTROL=false`).

## Installation locale

Pré-requis : Python 3.11+, Node.js 22 et pnpm 10.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # définir un secret aléatoire d’au moins 32 octets
npm install --global pnpm@10.18.0
cd frontend && pnpm install --frozen-lockfile && pnpm run build && cd ..
uvicorn web.app:app --reload --host 0.0.0.0 --port 10000
```

Sans `DATABASE_URL`, SQLite est utilisé dans `data/aeromind.db` pour le développement. Le démarrage crée de manière idempotente les tables SQLAlchemy nécessaires ; toute évolution destructive doit être accompagnée d’une migration versionnée avant déploiement.

### Compose local recommandé

```bash
docker compose up --build
curl http://localhost:10000/api/ready
```

Compose lance PostgreSQL et l’image full-stack définie dans `Dockerfile`. Le frontend compilé est servi par FastAPI et l’API est disponible sous `/api`.

## Configuration

Variables principales : `DATABASE_URL` (PostgreSQL ou MySQL/MariaDB en production), `AEROMIND_SESSION_SECRET`, `AEROMIND_ENV`, `AEROMIND_ALLOWED_ORIGINS` (liste exacte d’origines séparées par virgule), `AEROMIND_ALLOWED_HOSTS`, les variables `OIDC_*`, `AEROMIND_SUPERADMIN_EMAILS` et, facultativement, `OPENAI_API_KEY`/`OPENAI_API_BASE`/`OPENAI_MODEL`. **Ne jamais committer les secrets.** `HARDWARE_CONTROL` reste à `false` par défaut.

## API métier

API JSON sous `/api`. Les projets, simulations, rapports, sessions LabBench, drones et réglages sont rattachés au sujet OIDC authentifié et filtrés par propriétaire. Routes :

- `GET/POST /api/projects`, `GET/PUT/PATCH/DELETE /api/projects/{id}`
- `GET/PUT /api/projects/{id}/drone`
- `GET/POST /api/projects/{id}/simulations|reports|lab-sessions`, puis `GET/PUT/PATCH/DELETE .../{record_id}`
- `GET/PUT /api/settings`
- `GET /api/health` (application, version, base, mode)

Création de projet crée un drone par défaut lié au projet. Le pont `/api/trpc` est conservé pour les écrans historiques.

## Premier administrateur

Pour l’expérimentation, `mcgregoralvin14@gmail.com` est l’adresse Super-Admin par défaut. Elle doit se connecter via Microsoft Entra/OIDC avec cette même identité ; aucune connexion locale ni mot de passe n’est créé. Le rôle est piloté par `AEROMIND_SUPERADMIN_EMAILS` : remplacez cette variable par une autre adresse, indiquez plusieurs adresses séparées par des virgules, ou définissez-la à vide pour supprimer l’accès Super-Admin. La modification est donc réversible depuis les variables d’environnement Render, sans modifier le code.

## Docker et Render

`docker build -t aeromind . && docker run --env-file .env -p 10000:10000 aeromind`. Le `docker-compose.yml` fournit un environnement local avec PostgreSQL. Le `render.yaml` déclare le service Docker, PostgreSQL et les références de secrets. Définir dans Render les origines et hôtes exacts du domaine réel ainsi que les paramètres OIDC et le redirect URI avant déploiement.

## CI et contrôles

GitHub Actions exécute les migrations sur PostgreSQL éphémère, pytest, les tests et le typage frontend ainsi que le build Docker. Localement : `pytest -q`, puis `cd frontend && pnpm run check && pnpm test -- --run && pnpm run build`.

## Vérification Compose

Avec Docker Engine et Compose v2 : `docker compose up --build` construit l’image, démarre PostgreSQL et l’API/frontend, puis `curl http://localhost:10000/api/ready` vérifie la disponibilité. Les tests frontend restent exécutables avec `cd frontend && pnpm run check && pnpm test -- --run && pnpm run build`.

## Sécurité matérielle

L’archive ne contient aucun pilote d’actionneurs ni package `hardware/`. Le module `web/mavlink_observer.py` accepte uniquement des trames MAVLink entrantes en lecture seule; la nouvelle action d’observation n’ouvre le polling qu’après le protocole humain. Aucun message de commande MAVLink, liaison série, CAN ou Ethernet sortante n’est implémentée. `HARDWARE_CONTROL=false` et la barrière serveur rejette les transitions vers le matériel. Le SITL expose un statut de simulation; il ne pilote pas d’actionneurs. Les fiches de configuration LabBench sont déclaratives et locales. Une fonction logicielle d’arrêt n’est pas une preuve d’E-stop physique.

Le **Centre de commande et de validation humaine** ajoute un workflow authentifié et persistant en simulation seulement : préparation, présentation des informations, approbation/refus explicites, expiration, annulation, exécution de démonstration et journal chronologique. L’approbation est liée à une empreinte SHA-256 de la demande. Les seules actions admises sont des opérations `simulation-*` sans paramètres. Les réponses portent `sent_to_hardware: false`, `physical_effect_verified: false` et `evidence_level: synthetic_demo`. Aucune commande matérielle n’est disponible dans ce centre.

## Synchronisation du workspace entre les écrans

Les écrans du cockpit partagent la configuration du projet actif (`ConceptConfig`) : drone/profil, géométrie, dessin personnalisé, matériaux installés, réglages de vol virtuels, plan de mission et exigences. Le bandeau **Projet synchronisé**, affiché au-dessus de chaque vue, expose le drone/dessin actif, le matériau sélectionné, la nomenclature, les exigences et les commandes virtuelles.

- Sélectionner un concept dans la bibliothèque des drones l’applique au workspace actif; les écrans de conception, de construction, de simulation et d’opérations lisent ensuite la même configuration.
- Sélectionner un matériau met à jour la sélection partagée immédiatement. Son installation dans la nomenclature reste une action distincte via **Ajouter à la nomenclature**; le composant installé est ensuite visible dans la bibliothèque, le Studio et l’atelier d’assemblage.
- Les traits du drone personnalisé sont conservés dans `customSketch` avec la configuration, et sont propagés avec les snapshots du workspace.
- Le stockage local et les onglets de la même session peuvent partager le snapshot; la persistance serveur exige un projet actif et une session authentifiée. Sans projet actif, l’interface reste en exploration et n’annonce pas une sauvegarde serveur. Les conflits d’édition simultanée entre plusieurs utilisateurs ne sont pas résolus par un protocole collaboratif/CRDT.

Cette synchronisation ne débloque aucun pilote ni sortie physique : les modifications restent des données et commandes de simulation.

## Protocole humain d’activation — contrôle avancé (19 octobre 2026)

Le poste de mission exige désormais une checklist complète et une confirmation humaine distincte avant le démarrage d’une simulation locale. Toute modification du profil, du parcours ou de l’environnement révoque l’approbation et réinitialise les cases. La connexion WSS entrante exige sa propre checklist et un consentement séparé; modifier l’URL, retirer une validation ou déconnecter révoque l’accord. Les protocoles rappellent l’usage civil/défensif déclaré, le caractère non vérifié des données et l’absence de commande physique.

Cette mise à jour n’ajoute aucun chemin de commande réel. L’armement matériel, le décollage, les commandes de vol, l’écriture de paramètres, le téléversement de mission et l’activation HARDWARE restent bloqués côté serveur (`feature_enabled()` retourne toujours `false`). Les cases constituent un contrôle humain d’interface, pas une certification ni une garantie de sûreté opérationnelle. La télémétrie du cockpit reste entrante et lecture seule. L’action **Observer MAVLink** démarre, après la checklist et le consentement, un polling de `GET /api/telemetry/mavlink/status`; le parseur frontend rejette tout snapshot qui n’affirme pas `read_only: true` et `hardware_commands_enabled: false`. Aucun message MAVLink n’est émis par cette interface.

## Vérité opérationnelle v2.0

- Le serveur est la source unique de l’état opérationnel : N2 est le seul niveau actif et N3/N4 répondent avec leurs préconditions manquantes.
- `HARDWARE_CONTROL` ne peut pas activer une sortie physique dans cette version ; `arm`, `actuator-write` et `mission-upload` restent rejetés.
- Le Centre de commande n’exécute que des demandes de simulation ; l’approbation humaine ne confère aucun accès matériel.
- Les attestations sont marquées **Attestation simulée — NON ÉMISE** et les événements locaux sans accusé serveur ne sont pas présentés comme persistés.


## Studio de conception et de construction — mise à jour du 14 octobre 2026

Le Studio dispose désormais d’un tableau de commande supérieur inspiré du poste de conception de référence, intégré aux ateliers déjà présents dans AeroMind.

- Sélection explicite de profils civils multirotor, voilure fixe et VTOL depuis le catalogue; la sélection met à jour la configuration partagée du workspace.
- Paramètres d’envergure, charge utile, vitesse, altitude et énergie éditables; les modifications alimentent la géométrie paramétrique, l’assemblage et les estimations.
- Navigation vers l’éditeur géométrique, les bibliothèques matériaux/avionique, l’atelier d’assemblage, les contrôles locaux et les exports.
- Analyse locale fondée sur `runSimulation`, avec état de fraîcheur, indicateurs et limites visibles.
- Exports téléchargeables en OpenSCAD (`.scad`), nomenclature (`.csv`), dossier d’ingénierie (`.json`) et document Studio (`.json`).

Les résultats restent des estimations conceptuelles; ils ne constituent pas une analyse CFD/FEA, une validation de vol, un plan certifié, un fichier STEP ni une conformité EASA/OTAN. La persistance entre sessions dépend de l’existence d’un projet et d’une session authentifiée; en mode brouillon, les données restent locales.


## Atelier STRATA-02 — conception physique interactive

La vue native **Construction physique**, accessible depuis la navigation latérale AeroMind, ouvre un atelier intégré avec :

- huit profils distincts (multirotors, hexacoptère, industriel, voilure fixe et surveillance) ;
- une scène Three.js / React Three Fiber réellement manipulable (orbite, zoom, rotation automatique et grille) ;
- personnalisation de couleur, matériau visuel, composants visibles et vue technique filaire ;
- fiche technique indiquant explicitement les valeurs indicatives/estimées ;
- variantes enregistrées dans `localStorage` avec date et modèle ;
- exports JSON de configuration et PNG du canvas WebGL ;
- filtres de catégorie et recherche sans rechargement.

Les géométries de cette première tranche sont générées localement par primitives Three.js : elles sont adaptées à l’exploration visuelle et ne constituent ni des maillages CAO validés, ni une étude mécanique, ni une certification. Les exports GLB/STL/PDF ne sont pas annoncés comme disponibles tant qu’un exporteur de maillage/document n’est pas intégré.


## Mechanical Twin — export de fabrication ajouté

L’espace Mechanical Twin regroupe déjà l’édition paramétrique des pièces, l’historique annuler/rétablir, les variantes, les calques de composition, les vues solide/filaire/X-ray, la symétrie, les modules manuels, l’analyse structurelle du maillage et les exports JSON/OBJ. L’action **Fabrication** exporte désormais également un **STL ASCII triangulé en mètres**, généré à partir des transformations géométriques et des pièces visibles du modèle. Le téléchargement est local au navigateur; aucune écriture serveur n’est présumée.

Ces outils sont destinés à la conception conceptuelle et à la revue. Un STL n’est pas un dossier de fabrication certifié : vérifier unités, tolérances, orientation, maillage fermé, matériaux et paramètres machine dans un outil CAO/slicer qualifié avant toute fabrication. Aucun calcul CFD/FEA, certification ou contrôle physique n’est impliqué.

## Bibliothèque des cellules — références du PDF

Huit cellules dérivées du PDF utilisateur sont intégrées au registre partagé `frontend/client/src/lib/droneCatalog.ts`. Leur sélection met à jour le workspace AeroMinD et les vues qui lisent ce registre (fiche, studio, simulation et jumeau mécanique). Les dimensions importées sont celles des maquettes CAO illustratives en mètres, pas des mesures certifiées ni des performances opérationnelles. Chaque aperçu donne accès aux fichiers associés sous `frontend/client/public/assets/aeromind-cell-library/` : SVG HUD, SVG source, rendu vectoriel CAD, PNG d’aperçu, OBJ, STL et source OpenSCAD.

Le modèle 08 conserve sa silhouette de référence mais est livré dans cette bibliothèque comme variante non armée : les charges externes offensives ont été exclues des fichiers CAD intégrés et sa charge utile est nulle. Tous ces profils restent conceptuels et en simulation; sélectionner une cellule ne crée ni commande matérielle ni pilote. La synchronisation serveur des données d’un projet reste soumise aux mécanismes habituels d’authentification et de persistance déjà décrits ci-dessus.

## Adaptateur de test `simulation-only`

`frontend/client/src/lib/simulationOnlyAdapter.ts` fournit un adaptateur local pour intentions abstraites issues de `virtual-joystick` ou `test-input`. L’onglet **Banc commandes SIM** de la console d’opérations expose un joystick à curseurs, une checklist, un consentement distinct, un journal local et un test explicite du refus `MANUAL_CONTROL`. Il n’importe aucun module matériel, ne crée ni socket ni requête HTTP et ne reçoit aucun callback de transport. Les intentions acceptées sont limitées aux axes simulés et à l’état d’armement/désarmement virtuel; elles aboutissent uniquement dans une file mémoire drainable par le simulateur local.

L’adaptateur démarre sans consentement. Il exige les quatre cases de `SIMULATION_ADAPTER_CHECKLIST` et un appel explicite à `approveHumanConsent(true)`. Tout changement de checklist ou retrait du consentement vide la file. Les intentions dont l’horodatage est absent, futur ou vieux de plus d’une seconde sont refusées; la même vérification est refaite au retrait de la file. Les tentatives `MANUAL_CONTROL`, armement physique, actionneur, téléversement ou source `hardware-transport` sont journalisées comme refusées; chaque entrée d’audit indique `physicalTransportInvoked: false`. Un heartbeat est enregistré comme observation uniquement : il ne coche aucune case et ne crée aucun consentement.

Exemple d’utilisation isolée en test : construire `new SimulationOnlyAdapter()`, cocher explicitement chaque entrée via `setChecklist`, accorder le consentement humain de test, puis soumettre un `axis-input` horodaté. Lire les sorties avec `consumeSimulationQueue(now)` pour les remettre au moteur de simulation. Ne branchez pas cette file à `web/hardware_api.py` ni à un émetteur MAVLink; les tests doivent conserver ce confinement local.
