# Correctif — viewport WebGL2 aérodynamique

Date : 13 novembre 2026

## Symptôme

Le centre Aérodynamique & CFD refusait de créer son renderer Three.js avec le message « WebGL 2 est obligatoire pour ce viewport, mais le navigateur n’a pas accordé de contexte ».

## Cause et correction

La détection partagée de WebGL2 créait un canvas de sonde, ouvrait un contexte graphique, puis le perdait juste avant l’initialisation du véritable renderer. Cette sonde pouvait entrer en concurrence avec les contextes effectivement réservés par les autres vues. La détection ne crée désormais plus de contexte : elle vérifie uniquement l’API WebGL2 du navigateur, et laisse la création effective au renderer après réservation du créneau partagé.

Le terrain 3D procédural utilisait également un `<Canvas>` React Three Fiber sans prendre le créneau commun. Il participe maintenant à la même file d’attente, libère son créneau lorsqu’il sort de la zone visible ou lorsque son renderer échoue, et conserve son rendu de compatibilité existant en cas d’indisponibilité.

Aucune nouvelle arborescence, dépendance, API de contrôle ou logique métier n’a été introduite. Les autres composants continuent d’utiliser le mécanisme partagé préexistant.

## Données et limites scientifiques

Ce correctif concerne exclusivement la disponibilité du viewport 3D. Les valeurs aérodynamiques de l’espace de travail restent des estimations locales/synthétiques déjà identifiées par l’interface; ce correctif ne les transforme pas en mesures physiques ni en résultats d’un solveur CFD. Il ne modifie ni paramètres, ni historique, ni scénarios, ni communications avec le matériel.

## Vérifications

- `pnpm check` : réussi.
- `pnpm test` : 96 fichiers, 476 tests réussis, dont les deux tests de régression WebGL2.
- `pnpm build` : réussi; l’avertissement existant sur la taille de certains bundles demeure.
- Route de prévisualisation `/?view=aero-cfd` : HTTP 200 en local et via l’URL HTTPS exposée.
