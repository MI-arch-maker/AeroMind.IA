# AeroMind — rapport d’inspection technique

Date : 30 octobre 2026

## Portée effectuée

Inspection statique ciblée des composants **Centre Paramétrique** et **Simulation & Analyses**, de leurs styles et de leur branchement dans `Home.tsx`. Contrôle du flux projet dans `Home.tsx` et lecture des tests de régression existants portant sur le workspace vierge et la création explicite de projet.

## Correctifs appliqués

- **Centre Paramétrique — affichage** : contraintes de dimensions minimales et de débordement corrigées, colonnes adaptatives, masquage maîtrisé du panneau inspecteur en largeur intermédiaire et disposition verticale sur petit écran. La zone de vue 3D et la table des variables conservent une taille minimale exploitable.
- **Plein écran** : le bouton du viewport déclenche maintenant l’API Fullscreen du navigateur, suit l’état réel plein écran et permet d’en sortir.
- **Capture 3D** : le canvas WebGL conserve son buffer de dessin afin de rendre la capture du rapport moins sujette à une image vide.
- **Import paramétrique** : validation des variables importées par type et plages de valeurs; les variables liées à `ConceptConfig` mettent également à jour le projet actif. Les champs inconnus, non numériques ou hors plage ne sont pas appliqués.
- **Architecture et synchronisation** : les corrections restent confinées au composant paramétrique et à ses styles; elles réutilisent le `ConceptConfig` commun, sans créer de nouveau store ou flux parallèle.

## Garde-fou de création de projet

Le code vérifié laisse la liste distante vide lorsqu’aucun projet n’existe. Sans utilisateur authentifié, `createProject()` s’arrête et n’ouvre pas de création; avec authentification, il ouvre le dialogue. La création et l’écriture serveur ne commencent qu’après confirmation (`confirmCreateProject`). Le bandeau « Workspace vierge — aucune création automatique » l’indique aussi à l’écran. Le test existant `test_no_default_project_at_startup` vérifie une liste vide pour un compte vierge.

## Vérifications exécutées

- `pnpm check` : succès (catalogues i18n et TypeScript).
- `pnpm test` : **56 fichiers, 281 tests réussis**.
- `pnpm build` : compilation de production réussie. L’outil signale des avertissements préexistants sur la taille de certains bundles et la balise de configuration runtime dans `index.html`; ils n’empêchent pas le build.
- Suite Python `tests/test_functional_regressions.py` : non exécutée jusqu’aux tests, car l’environnement n’a pas SQLAlchemy (`ModuleNotFoundError: sqlalchemy`). `pytest` a été installé mais cette dépendance applicative n’était pas présente.

## Limites de vérification

L’archive a été contrôlée et compilée; le navigateur intégré est indisponible pour une recette visuelle interactive, multi-résolution ou un clic-test exhaustif sur chaque bouton de tous les modules. Le présent travail valide et corrige les points techniques repérés sur ces écrans, sans prétendre certifier chaque interaction de l’application entière à 100 %. Les boutons qui sont encore des prototypes ou affichent des notifications d’information devront être remplacés par les opérations métier attendues, écran par écran, après définition de ces comportements.

## Fichiers sources principaux

- `frontend/client/src/components/ParametricDroneCenter.tsx`
- `frontend/client/src/components/parametric-drone-center.css`
- `frontend/dist/` (bundle de production régénéré)
