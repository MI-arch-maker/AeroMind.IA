# Inspection opérationnelle AeroMind — 14 novembre 2026

## Périmètre

Inspection effectuée sur la source fournie `Aeromind.IA.zip`, sans réinitialiser l’arborescence AeroMind, sans remplacer ses dépendances et sans ajouter de garde-fou externe. Les contrôles ont porté sur le frontend React/Vite, le backend FastAPI, les routes déclarées, les endpoints de santé, les données de démonstration injectées implicitement et les appels réseau des écrans.

## Résultats

- Frontend : `pnpm install --frozen-lockfile`, typecheck, 97 fichiers de tests et 508 tests passés, puis build Vite réussi.
- Backend : 355 tests passés avec `AEROMIND_SUPERADMIN_EMAILS` configuré dans l’environnement de test, 13 tests ignorés.
- Runtime local : `/api/health` = 200, base SQLite connectée ; `/api/ready` = 200, mode `simulation` explicite.
- Routes vérifiées : `/`, `/manus-routes.json`, `/gate-certification.html`, `/virtual-factory`, `/build-readiness`, `/labbench`, `/engineering-hub`, `/admin-console`, `/audit-journal`, `/security-center` répondent 200.
- Les actions applicatives inspectées disposent soit d’un état local explicite, soit d’un appel API/tRPC/WebSocket correspondant. Aucun handler `onClick` vide n’a été trouvé par l’analyse statique ciblée.

## Correction appliquée

Suppression dans `frontend/client/src/pages/Home.tsx` d’un ancien objet `demoProject` déclaré comme scénario d’inspection synthétique mais non référencé par le runtime. Cette suppression ne touche ni `demoScenario()` ni les modes de simulation locaux explicites : ces modes restent disponibles lorsqu’un opérateur les lance volontairement et restent correctement identifiés comme simulations non physiques.

Aucun contenu de catalogue, aucune donnée utilisateur, aucun schéma SQL, aucune dépendance et aucune règle de contrôle matériel n’ont été supprimés.

## Données synthétiques conservées volontairement

AeroMind contient des modèles locaux de simulation, de télémétrie et de LabBench. Ils ne sont pas des données réelles cachées : ils sont déclarés par le code comme simulation/synthétique, sans sortie matérielle, et sont nécessaires au fonctionnement local demandé. Les supprimer indistinctement casserait les écrans de simulation et constituerait une régression contraire au cahier des charges.

Les données utilisateur explicitement marquées `synthetic`, `demo`, `demonstration` ou équivalent sont déjà exclues des scénarios actifs par les fonctions de purge/partition existantes ; les valeurs ambiguës ne sont pas supprimées automatiquement.

## Point de configuration

Sans `AEROMIND_SUPERADMIN_EMAILS`, un test d’administration échoue car aucune identité principale n’est configurée. Avec `AEROMIND_SUPERADMIN_EMAILS=primary@example.test`, le test passe. Il s’agit d’une précondition d’environnement, pas d’un défaut de code ; aucune adresse réelle n’a été ajoutée à la source.

## Prévisualisation locale

La prévisualisation a été démarrée avec `./start.sh`, en SQLite isolé et en mode logiciel/simulation. URL de prévisualisation :

`https://3000-izi1svvqnalklpw3p4bsi-41310bc4.us3.manus.computer/`

Cette URL expose le runtime local de la session ; les connexions OIDC, matériels réels, MAVLink physiques et services externes restent dépendants de leur configuration opérationnelle propre.

## Livraison

Le ZIP de livraison exclut `node_modules`, `frontend/dist`, `.venv`, bases SQLite, logs et secrets locaux. Il contient la source, les lockfiles, la documentation existante et ce rapport.
