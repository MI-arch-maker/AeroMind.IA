# AeroMind — Liaison des types de section au générateur CAO

Date : 31 octobre 2026

## Fonctionnalité livrée

Les contrôles **Circulaire**, **Elliptique** et **Polygonale** du Centre Paramétric sont désormais reliés au modèle de configuration du projet et au générateur `MechanicalTwin`.

Le choix est persisté dans `ConceptConfig.fuselageSectionType` ainsi que dans la configuration Mechanical Twin du design actif (`mechanicalTwins[designId].fuselageSectionType`). Le changement reconstruit le fuselage sélectionné dans le viewport CAO sans modifier les autres designs.

Le générateur utilise maintenant :

- une section circulaire avec un anneau à 16 côtés et rayon équilibré ;
- une section elliptique avec un anneau à 16 côtés et rayons X/Y distincts ;
- une section polygonale avec un anneau à 6 côtés.

Les trois variantes sont triangulées, finies et transmises au viewport comme géométrie mécanique réelle.

## Validation

- `pnpm run check` : réussi.
- Suite Vitest : 70 fichiers et 334 tests réussis.
- Nouveau test de régression : reconstruction des trois types et distinction de leurs maillages.
- `pnpm run build` : réussi.
- Preview : HTTP 200.

Le build conserve uniquement les avertissements préexistants de taille de chunks Vite.
