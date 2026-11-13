# AeroMind — Mode Preview temps réel de l’arbre des features

**Date :** 31 octobre 2026  
**Fonctionnalité :** prévisualisation directe des features dans le viewport 3D  
**Statut :** livré, testé et prévisualisable

## Fonctionnement

Un bouton œil est disponible dans l’en-tête de l’**Arbre des features**. Il active ou désactive le mode `FEATURE TREE PREVIEW`.

Chaque feature de l’historique CAO est désormais cliquable. Lorsqu’une feature est sélectionnée :

- la pièce produite par cette feature est identifiée dans le modèle mécanique ;
- sa géométrie reste dans le viewport sans modifier la configuration persistée ;
- elle est affichée en amber/semi-transparence avec un contour renforcé ;
- un badge `FEATURE TREE PREVIEW` affiche l’identifiant de la feature active ;
- le résultat fonctionne en WebGL Three.js et dans le fallback vectoriel.

Le mode est non destructif : changer la sélection de l’arbre met à jour immédiatement la couche de preview, tandis que désactiver l’œil revient au rendu normal.

## Fichiers modifiés

- `frontend/client/src/components/ParametricDroneCenter.tsx`
- `frontend/client/src/components/MechanicalTwinViewport.tsx`
- `frontend/client/src/components/mechanical-twin.css`
- `frontend/client/src/components/parametric-drone-center.css`

## Validation

- Typecheck TypeScript : réussi.
- Tests ciblés et suite frontend : **68 fichiers, 328 tests réussis**.
- Build Vite de production : réussi.
- Preview publique : HTTP 200 vérifié.

## URL de prévisualisation

https://3000-isxjadql64jdfr4nkhrpp-a32a466a.sg2.manus.computer/

## Limite fonctionnelle explicite

La preview 3D s’applique directement aux features effectivement construites et présentes dans l’historique CAO. Les entrées statiques de démonstration qui ne possèdent pas encore de feature persistée ne produisent pas de géométrie preview tant qu’une opération réelle n’a pas été exécutée.
