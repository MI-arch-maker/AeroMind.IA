# Livraison — Modernisation AeroMind / LABBENCH 01

## Périmètre livré

- LABBENCH 01 est présenté comme une interface intégrée à AeroMind, avec double identification visible : session primaire AeroMind et session secondaire LABBENCH 01 (step-up).
- La source de vérité de LABBENCH est désormais le projet serveur AeroMind sélectionné. Les projets anonymes/localStorage ne sont plus utilisés pour alimenter les vues LABBENCH.
- À l’activation LABBENCH, l’interface récupère la configuration du projet et le drone actif ainsi que sa révision canonique via l’API `/api/lab/projects/{id}/drones/active`.
- Les sous-vues et onglets existants restent montés dans la navigation 5 zones et affichent un état vide explicite quand aucune donnée AeroMind n’est disponible.
- L’audit initial et les bandeaux de données fictives ont été supprimés ; aucun jeu de télémétrie ou projet synthétique n’est injecté côté interface.
- Les garde-fous existants restent inchangés : sorties physiques verrouillées, `hardware_control=false`, contrôle humain et gates serveur conservés.

## Vérifications

- TypeScript + catalogue i18n : OK.
- Build frontend Vite : OK.
- Tests ciblés LABBENCH/régressions : 29 passés, 11 ignorés.
- Syntaxe Python backend : OK.
- Prévisualisation : `/api/ready`, `/api/health`, `/api/capabilities`, `/labbench` et `/manus-routes.json` en HTTP 200.

## Prévisualisation locale de livraison

Le serveur de prévisualisation écoute sur le port 10000 et sert le frontend compilé ainsi que l’API FastAPI.
