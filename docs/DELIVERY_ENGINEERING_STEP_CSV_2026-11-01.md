# Livraison — Adaptateur STEP/CSV, simulations et registre connecteurs AeroMind

**Date :** 1er novembre 2026  
**Résultat :** socle v1 codé et validé en local, mais acceptation complète conditionnelle. Cette livraison n’installe, ne configure et ne déclare aucun outil externe connecté.

## Composants livrés

- `web/engineering_files.py` : profils BOM CSV et résultats de simulation, sélection stricte de dialecte, validations, normalisation JSONL, rapports et export CSV machine/tableur-sûr. L’inspection STEP Part 21 vérifie la structure, les références et les schémas AP203/AP214/AP242; elle ne décode pas la géométrie.
- `web/engineering_connectors_api.py` : API authentifiée d’import en quarantaine, dry-run, lecture de rapport, commit explicite, export/téléchargement, catalogue des familles et routes de simulation.
- `web/engineering_jobs.py` et `web/engineering_worker.py` : traitement persistant/idempotent des jobs par worker, rapport versionné et absence d’exécution de code fourni par le fichier.
- `web/engineering_connector_registry.py` : registre serveur des 13 familles; aucun état de connexion n’est déduit d’une simple détection locale.
- `web/models.py`, `migrations/2026-11-01_engineering_files_connectors.sql` et variante TiDB : stockage des artefacts, jobs, runs internes et lien optionnel vers une cellule.
- `docker-compose.yml`, `render.yaml`, `.env.example` : worker Compose isolé; l’import reste désactivé sur Render tant qu’un worker et un stockage persistant partagé ne sont pas provisionnés.
- `frontend/client/src/modules/engineering-hub/EngineeringConnectorPanel.tsx` : interface Hub, import dry-run, revue/commit, export et simulation interne. Le proxy Vite `/api` est configurable via `AEROMIND_API_TARGET` et n’affecte que le serveur de développement.

## Contrat du flux livré

1. L’utilisateur authentifié sélectionne un projet et peut associer une cellule `cell_id`.
2. Le fichier est reçu en quarantaine, borné, haché et rattaché à un job idempotent.
3. Le worker valide en dry-run; il ne traite jamais un STEP comme géométrie importée et ne déclenche aucune commande matérielle.
4. Une revue explicite et un hash source correspondant sont requis pour le commit. Les lignes rejetées exigent un acquittement; le STEP exige une confirmation « artefact source seulement ».
5. Un export exige une source CSV commitée. Les fichiers sont téléchargeables uniquement par leur propriétaire.

**Limite importante :** le commit persiste le statut de l’artefact et la version normalisée rattachée au projet; il ne convertit pas encore ces données vers les entités métier BOM, exigences ou géométrie. Cette intégration reste un chantier distinct.

## Simulation et sécurité

- Simulation interne : run idempotent, preuve `educational_model`, donc démonstration/modèle pédagogique et non prédiction certifiée; `physical_output_enabled` reste `false`.
- Simulation externe PX4/ArduPilot : route fail-closed, statut `not_run` et HTTP 409 tant qu’un runner SITL isolé, versionné et testé n’est pas configuré. Aucun moteur externe n’a été lancé.
- Aucun scanner antivirus n’est intégré. Activer `AEROMIND_ENGINEERING_REQUIRE_AV_SCAN=true` bloque le commit sans verdict propre.
- Le worker Compose est non-root, en lecture seule hors volume de travail, sans périphériques déclarés et sur réseau interne dédié. La migration et les fichiers utilisateur n’ont pas été appliqués à une base réelle de production.

## Configuration et lancement (à exécuter dans votre environnement)

1. Copier `.env.example` vers `.env`, générer un `AEROMIND_SESSION_SECRET` aléatoire d’au moins 32 octets et renseigner l’accès DB/SSO requis par l’installation.
2. Configurer le chemin de stockage privé partagé entre API et worker; vérifier les quotas et sauvegardes.
3. Pour PostgreSQL : `bash scripts/apply_migrations.sh`. Pour TiDB : `bash scripts/apply_migrations_tidb.sh`. Contrôler la sauvegarde et le résultat avant activation.
4. En Compose : `docker compose up --build`. Vérifier le heartbeat du worker et la séparation réseau avant d’autoriser les imports.
5. Ne pas activer l’import de fichiers en production sur Render avant d’y provisionner un worker isolé et un stockage partagé durable. Les variables et secrets de production doivent venir d’un gestionnaire de secrets, pas du fichier d’exemple.
6. Avant tout SITL externe, choisir un simulateur/version, créer son runner confinée, établir des tests sans contrôleur physique et réviser les règles de sortie. Pour l’instant, la route externe refuse de démarrer.

## Vérifications exécutées

- `pytest -q tests/test_engineering_api_flow.py tests/test_engineering_file_adapter.py tests/test_engineering_migration_contract.py` : **15 réussis** (import → dry-run → rapport → commit → export/téléchargement, cellule, refus de cellule inter-projets, idempotence, refus SITL et contrôle propriétaire).
- `pnpm check` : réussi; catalogues i18n synchronisés (2 617 clés feuilles).
- `pnpm test` : **336 tests réussis, 70 fichiers**.
- `pnpm build` : réussi; avertissement de taille de certains chunks (>1,5 Mo) à traiter dans un lot performance.
- YAML de `docker-compose.yml` et `render.yaml` : parse valide; assertions statiques d’isolation du worker valides.
- OpenAPI : 119 chemins, incluant les routes du nouvel adaptateur.
- Suite backend ciblée plus large : **86 réussis, 7 échoués, 2 ignorés**. Les échecs constatés concernent trois essais de migration canonique PostgreSQL exécutés via l’adaptateur SQLite (`CREATE OR REPLACE FUNCTION`), trois tests de `NAV_TAKEOFF` sans coordonnées ni provider après le garde-fou de position, et un test de round-trip cache de géofence. Ils sont consignés plutôt que masqués; la suite globale ne peut pas être déclarée entièrement verte.
- Pas de test effectué sur PostgreSQL/TiDB réels, antivirus réel, connecteurs commerciaux, licences, runner SITL ou matériel physique.

## Prévisualisation

[Ouvrir AeroMind Hub — Connecteurs & formats](https://3000-iymx51dvmzo58bgxmsc3g-7fb2d9b5.us5.manus.computer/engineering-hub)

La prévisualisation charge le Hub et son panneau. Le backend est volontairement verrouillé, sans compte de démonstration ni SSO configuré; les endpoints protégés renvoient donc `401 OIDC authentication required` sans session. Aucun import ou changement de données ne doit être testé sur cet aperçu non authentifié.

## Fichiers source mis à jour

Les deux spécifications de référence ont été actualisées : `CAHIER_DES_CHARGES_ADAPTATEUR_STEP_CSV_SIMULATION_AEROMIND.md` et `CONTRAT_COMMUN_CONNECTEURS_13_FAMILLES_AEROMIND.md`. Le paquet source final exclut les dépendances téléchargées, builds, caches Python, fichiers `.env` locaux et données d’import.


## Correctif de compatibilité du dépôt

L’API complète ne pouvait pas être importée avec la version FastAPI épinglée (`Cookie()` ne prend pas `convert_underscores`, option destinée aux en-têtes). Le paramètre invalide a été supprimé des déclarations `Cookie(...)` touchées dans les modules de routes; les noms de cookies restent ceux des paramètres (`aeromind_session`, etc.). L’import de l’application et la génération du schéma OpenAPI ont ensuite réussi.
