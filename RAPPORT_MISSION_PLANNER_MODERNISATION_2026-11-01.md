# AeroMind — Modernisation Mission Planner

Date : 1 novembre 2026

## Audit des commandes

L’audit des contrôles placés autour et à droite de la carte a confirmé que les outils de carte, onglets Mission/GPS/Fence/Rally/IA, sélection de waypoint, recentrage, zoom, ajout GPS, géofence, Rally, survey et optimisation locale étaient reliés. En revanche, plusieurs boutons étaient explicitement désactivés ou renvoyaient uniquement un message d’indisponibilité : Fly, Analyse, Journal et téléversement.

## Fonctions livrées

- **Aperçu de vol** : démarre/arrête une télémétrie synthétique locale avec vitesse, cap et consommation de batterie simulés.
- **Analyser** : calcule et affiche un résumé local du plan : waypoints, distance, surveys, limites et points Rally.
- **Exporter le plan** : télécharge `aeromind-mission-plan.json` avec le plan partagé, les waypoints WGS84, la géofence, les points Rally et les paramètres Survey.
- **Exporter journal** : télécharge `aeromind-flight-log.json` avec la télémétrie synthétique, le résumé d’analyse, la distance et la durée estimées.
- Les boutons de zoom et de recentrage restent actifs.
- Les outils de carte restent locaux et synchronisent les changements utilisateur vers `config.missionPlan`.

Aucune de ces actions ne transmet de commande à un drone réel. Le téléversement matériel reste volontairement remplacé par un export JSON explicite.

## Validation

- `pnpm run check` : réussi.
- Tests ciblés et suite Vitest : **70 fichiers / 336 tests réussis**.
- Nouveau test : format et contenu de l’export local Mission Planner.
- `pnpm run build` : réussi.
- Preview : HTTP 200.

Les messages de build non bloquants sont les avertissements Vite déjà présents sur la taille des chunks et le script runtime `/api/platform/config.js`.
