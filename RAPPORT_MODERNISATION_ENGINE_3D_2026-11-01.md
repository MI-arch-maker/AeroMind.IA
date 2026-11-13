# AeroMind — Rapport de modernisation du moteur 3D

Date : 1 novembre 2026

## Audit réalisé

Le projet fourni est une application full-stack existante : frontend React/Vite/TypeScript, backend FastAPI, migrations SQL, télémétrie MAVLink en lecture seule, scénarios SITL/HIL, Centre Paramétric, registre de cellules, modèle de jumeau mécanique, simulation, flotte et 70 fichiers de tests frontend.

Les composants réutilisables identifiés sont `ConceptConfig`, `DroneCatalogDesign`, `buildMechanicalModel`, `transformedPartVertices`, `MechanicalTwinViewport`, `ParametricDroneCenter`, `DigitalTwinExplorer`, les adaptateurs de télémétrie et le résultat de simulation `SimulationResult`. La base contient déjà des représentations paramétriques, mais aucune vue unique ne regroupait les quatre modes obligatoires du cahier des charges maître.

## Modernisation livrée

- Ajout de `AircraftRepresentationEngine.tsx`.
- Ajout de `aircraft-representation-engine.css`.
- Intégration de l’écran dans `Home.tsx` et dans l’ordre de navigation existant.
- Quatre vues partagent la même géométrie issue de la cellule active : extérieure, technique, poursuite et flotte.
- La vue flotte réutilise la même identité de modèle dans un scénario explicitement simulé ; elle ne prétend pas représenter trois drones réels.
- L’état vide est honnête : sans cellule sélectionnée, aucune géométrie générique n’est injectée.
- Les métriques affichent l’identifiant de cellule, le `designId`, le nombre de composants, le `runId`, la version du moteur et l’identifiant de projet lorsqu’il existe.
- Le panneau de provenance distingue la géométrie active du Centre Paramétric et les valeurs de vol simulées.
- Aucun accès matériel, armement, commande ou téléversement n’a été ajouté.

## Validation

- `pnpm run check` : réussi — 2 617 clés i18n synchronisées, TypeScript sans erreur.
- `pnpm test -- --run` : réussi — 70 fichiers, 336 tests.
- `pnpm run build` : réussi — `frontend/dist/index.html` généré.
- Prévisualisation : HTTP 200 sur le serveur frontend.
- Manifeste `manus-routes.json` : HTTP 200 et JSON valide ; le moteur est une vue interne de Home et n’ajoute pas de route URL concurrente.

Les avertissements de taille de bundle Vite restent non bloquants et préexistants ; le chunk Three.js est isolé par la configuration Vite existante.

## Limites déclarées

Cette tranche fournit une représentation 3D paramétrique opérationnelle et intégrée. Elle ne constitue pas encore une conversion certifiée STEP/IGES, un noyau B-Rep, une preuve photogrammétrique ou une télémétrie physique. Les scénarios de flotte et les mouvements affichés dans ce nouvel écran restent explicitement simulés. La synchronisation de vol physique doit encore être raccordée à une trame fraîche et authentifiée au niveau de l’écran si ce comportement est requis par la validation finale.

## Retour arrière

Supprimer `frontend/client/src/components/AircraftRepresentationEngine.tsx`, `frontend/client/src/components/aircraft-representation-engine.css` et retirer l’import, l’entrée de navigation et le bloc `activeView === "aircraft-engine"` ajoutés dans `frontend/client/src/pages/Home.tsx`. Les écrans et données antérieurs restent indépendants.
