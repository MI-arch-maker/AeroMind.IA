# AeroMind — Réparation Arbre des Features et Inspecteur Paramétric

**Date :** 31 octobre 2026  
**Statut :** corrigé, testé et prévisualisable

## Corrections de l’Arbre des Features

Les entrées Fuselage, Voilure, Surfaces contrôle et Propulsion sont maintenant de vraies actions de sélection :

- la feature sélectionnée est mémorisée ;
- le groupe actif est mis à jour ;
- une pièce mécanique correspondante est sélectionnée dans le viewport lorsque disponible ;
- le statut indique que le viewport est synchronisé ;
- les features de l’historique CAO restent cliquables et pilotent la preview 3D.

Les entrées d’historique disposent déjà du mode `FEATURE TREE PREVIEW` avec mise en évidence semi-transparente dans le viewport.

## Corrections de l’Inspecteur

### Type de section

Les boutons Circulaire, Elliptique et Polygonale mettent à jour l’état de section et affichent le type sélectionné dans le statut du Centre.

### Matériau

Les boutons Carbone T700, Aluminium 7075 et Kevlar 49 mettent à jour l’état visuel et synchronisent la finition et la couleur de coque dans le `MechanicalTwinConfig`. Le modèle mécanique est reconstruit avec la nouvelle finition.

### Surfaces de contrôle

Les quatre curseurs sont maintenant contrôlés et réactifs :

- débattement aileron ;
- débattement volet ;
- débattement profondeur ;
- débattement direction.

La valeur affichée suit immédiatement le curseur et le statut confirme la mise à jour.

## Validation

- Typecheck TypeScript : réussi.
- Tests frontend : **68 fichiers, 328 tests réussis**.
- Build Vite de production : réussi.
- Preview publique : HTTP 200 vérifié.

## URL de prévisualisation

https://3000-isxjadql64jdfr4nkhrpp-a32a466a.sg2.manus.computer/

## Fichiers principaux modifiés

- `frontend/client/src/components/ParametricDroneCenter.tsx`
- `frontend/client/src/components/MechanicalTwinViewport.tsx`
- `frontend/client/src/components/mechanical-twin.css`
- `frontend/client/src/components/parametric-drone-center.css`
