# Livraison — Centre de simulation aérodynamique Aeromind

Date : 3 novembre 2026

## Résumé

Le projet Aeromind conserve son cockpit et ses modules existants. Un centre aérodynamique natif est accessible par la rubrique **Aérodynamique & CFD**, avec une vue directe `/?view=aero-cfd` et quatorze rubriques de travail : Aerodynamic Dashboard, 3D Model Importer, CFD Workspace, Simulation Setup, Mesh Generator, Airflow Visualization, Pressure Analysis, Rotor Flow Analysis, Performance Comparison, Design Optimization, Simulation History, Technical Reports, Solver Management et Settings.

## Fonctions exercées

- Import OBJ dans le navigateur, affichage du maillage, dimensions/unité et compte des triangles; les fichiers ne sont pas téléversés au serveur. La géométrie du test OBJ a été décodée en local.
- Paramètres de flux, conditions physiques et scénarios conservés dans le navigateur; l’historique des runs est également local.
- Pression atmosphérique ISA automatiquement dérivée de l’altitude, avec mode pression manuelle explicite. En mode manuel, changer l’altitude ne remplace pas la pression saisie.
- Calcul d’estimation analytique et enregistrement d’un run identifié comme `ANALYTIC ESTIMATE`, jamais comme CFD.
- Estimation de la taille du domaine maillé avec message explicite qu’aucun maillage volumique n’a été généré.
- Exports d’historique CSV, de rapport JSON/Markdown, de proposition de revue paramétrique et de manifeste de préparation OpenFOAM vérifiés dans le navigateur.
- L’ouverture des quatorze rubriques, l’enregistrement de scénario, l’analyse, l’import OBJ, l’accès au rapport et la commande de vérification du solveur ont été exercés dans la Preview.

## Limites assumées

L’intégration d’exécution OpenFOAM a été différée à la demande de l’utilisateur. Aucun binaire de solveur ni service CFD n’est raccordé à cette Preview : le lancement d’un calcul CFD reste indisponible et est explicitement refusé. Le manifeste exporté est un transfert de préparation, pas un cas exécuté; aucun maillage, résultat de convergence, champ de pression CFD ou ligne de courant issue d’une simulation n’est fabriqué. Les analyses de performance/rotor sont des modèles simplifiés, avec leurs hypothèses et limites. L’import STEP et les conversions CAO non vérifiées restent en attente d’un parseur ou convertisseur fiable; seule la géométrie OBJ a été vérifiée ici de bout en bout.

Aucune publication production ni commande matérielle n’a été réalisée. Le backend Preview est en mode virtuel, sorties physiques désactivées, et Sentry désactivé dans le processus de développement lancé pour cette livraison.

## Vérifications

- `pnpm check` : réussi; catalogues synchronisés (2 617 clés) et TypeScript sans erreur.
- `pnpm test` : réussi, 78 fichiers et 374 tests.
- `pnpm build` : réussi.
- Preview : le backend répond sur le port 3000; le navigateur a ouvert directement `/?view=aero-cfd` et parcouru les quatorze rubriques ainsi que les principaux parcours/imports/exports.
- `pnpm i18n:lint` : échec sur le contrôle global de littéraux JSX absents des catalogues, dans de nombreux fichiers hérités et également dans les libellés français du nouveau centre. Ce contrôle additionnel n’est pas inclus dans `pnpm check`; l’interface du nouveau centre est principalement rédigée en français, tandis que les noms des rubriques restent ceux demandés.

## Archive

L’archive source est préparée sans `.git`, dépendances installées, environnement virtuel Python, base locale, variables d’environnement privées ni build généré. Les lockfiles, sources et documentation du projet sont conservés.
