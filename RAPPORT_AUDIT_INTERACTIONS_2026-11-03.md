# AeroMind — Audit accéléré des interactions

Date : 3 novembre 2026

## Conclusion

L’audit accéléré n’a confirmé aucune anomalie fonctionnelle parmi les candidats détectés par le scan statique. Les éléments sans `onClick` direct sont soit des déclencheurs Radix, des contrôles pointer, des boutons dont l’action est portée par un formulaire `onSubmit`, soit des contrôles intentionnellement désactivés faute de contexte projet.

Cette conclusion ne signifie pas que chaque combinaison de données, rôle, navigateur, périphérique et scénario a été exhaustivement exercée.

## Inventaire statique

- Fichiers TSX inspectés : 150
- Boutons repérés : 1 097
- Gestionnaires `onClick` : 1 133
- Gestionnaires `onChange` : 633
- Cases à cocher repérées : 47
- Cases à cocher sans `onChange` ni état contrôlé détectées : 0
- Formulaires repérés : 16
- Attributs `disabled` repérés : 393

## Échantillon ciblé validé

Le contrôle read-only a vérifié les candidats suivants : DashboardLayout, MechanicalWorkbench, OpenStreetMapView, UniversalWaypointSelector, VirtualSimulationCenter, WorkspaceWindow, Home, LabBench, SuperAdmin, EngineeringConnectorPanel, ainsi que les boutons de soumission de formulaire détectés.

Résultat :

- déclencheurs de menu et composants Radix : fonctionnels ;
- interactions pointer/carte/viewport : handlers présents ;
- timeline et navigation d’atelier : handlers présents ;
- boutons de moteurs et sélection : handlers présents ;
- export LabBench sans projet : désactivation intentionnelle ;
- boutons `type=submit` : formulaires `onSubmit` présents ;
- cases à cocher contrôlées : handlers et états présents ;
- anomalies confirmées : aucune.

## Vérifications de régression

- Suite Vitest : 78 fichiers, 374 tests réussis.
- Routes déclarées : 35 routes uniques, manifeste JSON valide.
- `/api/health` : HTTP 200.
- `/api/ready` : HTTP 200.
- `/api/hardware/status` : HTTP 200.
- `/manus-routes.json` : HTTP 200.
- `/gate-certification.html` : HTTP 200.

## Limite de preuve

Un scan statique et une suite de tests ne prouvent pas 100 % de toutes les interactions possibles. Les parcours non couverts nécessitent encore une matrice d’acceptation écran par écran, notamment pour les combinaisons de rôles, les erreurs réseau, les petits écrans, l’accessibilité clavier et les synchronisations concurrentes.

Les contrôles matériels restent hors périmètre d’activation et demeurent en mode virtuel fail-closed.
