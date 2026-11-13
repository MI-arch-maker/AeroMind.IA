# AeroMind — Rapport d’exécution du Centre Paramétric

**Date :** 31 octobre 2026  
**Lot :** 1 — raccordement du modèle mécanique réel et validation frontend  
**Statut :** livré et vérifié

## Réalisation

Le Centre Paramétric ne rend plus uniquement son modèle local de démonstration lorsqu’un profil AeroMind est réellement chargé. Il construit désormais le modèle à partir de `buildMechanicalModel()` et l’affiche avec `MechanicalTwinViewport`.

Le raccordement utilise les pièces triangulées, les dimensions, les assemblages, les matériaux et les transformations déjà sérialisables dans `mechanicalTwinGeometry.ts`. La sélection d’une pièce dans le viewport met à jour la feature inspectée. Chaque modification de configuration déclenche une nouvelle reconstruction déterministe et incrémente la révision de reconstruction affichée dans la barre d’état.

Le mode sans profil reste explicitement identifié comme **aperçu local non enregistré**. Il n’est pas présenté comme un drone AeroMind réel. En cas d’échec du contexte WebGL, le composant conserve le repli vectoriel existant et l’identifie comme tel.

## Fichiers modifiés

- `frontend/client/src/components/ParametricDroneCenter.tsx`
- `frontend/client/src/components/parametric-drone-center.css`

## Vérifications exécutées

- Installation : `pnpm install --frozen-lockfile` — succès.
- Catalogue i18n : 2 617 clés synchronisées — succès.
- TypeScript : `pnpm run check` — succès.
- Tests frontend : `pnpm test -- --run` — **67 fichiers, 324 tests réussis**.
- Build production : `pnpm run build` — succès.

Le build conserve les avertissements non bloquants déjà présents concernant le script runtime `/api/platform/config.js` et la taille de certains bundles, notamment Three.js.

## Limites restantes

Ce lot ne constitue pas encore la clôture du cahier des charges maître. Restent notamment à implémenter et démontrer :

- le noyau CAO OpenCASCADE/OCP/CadQuery ou la justification formelle d’une alternative compatible ;
- les opérations d’esquisse, extrusion, révolution, découpe, congé, chanfrein, perçage, coque, balayage et loft avec historique de features ;
- la persistance serveur des révisions paramétriques et la reconstruction après rechargement depuis la base ;
- les opérations complètes d’assemblage, ajout, remplacement et suppression contrôlée de composants ;
- les formats d’import/export CAO STEP, IGES, STL, OBJ, 3MF, DXF et glTF selon les capacités réellement intégrées ;
- les calculs physiques avec statut explicite et hypothèses ;
- la recette interactive et la vidéo de preuve exigées par les tests 01 à 14.

Aucune commande physique de drone n’a été activée ni modifiée.
