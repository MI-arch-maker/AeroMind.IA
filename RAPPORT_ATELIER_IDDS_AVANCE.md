# Livraison — Atelier IDDS / Assemblage numérique modernisé

## Résultat

L’espace **IDDS / Assemblage numérique** dispose d’un atelier plus dense, organisé autour d’un arbre d’assemblage, d’un viewport de jumeau mécanique, d’une barre d’outils CAO/compositing et d’un inspecteur de propriétés. La nouvelle interface reste **distincte** de l’application **Digital Twin Explorer** : elle emploie son composant IDDS dédié et ne partage que le modèle/viewport mécanique de bas niveau et ses données de géométrie.

## Fonctions mises en place

- **Outils de pièce** : sélection, déplacement, rotation, échelle, mesure, création de blocs/cylindres/carénages, duplication, suppression des pièces ajoutées et masquage.
- **Édition paramétrique** : transformations XYZ et dimensions de la sélection; paramètres de structure; matériau/finition et couleur lorsque disponibles dans le document actif. Les modifications reconstituent le maillage du drone ouvert.
- **Arbre d’assemblage et calques** : recherche et sélection des pièces, affectation et gestion manuelle des calques, visibilité, verrouillage, couleur/opacité et notes d’annotation; les actions demeurent locales et réversibles.
- **Référence visuelle locale** : chargement d’une image depuis le poste de l’utilisateur, avec réglages visuels (visibilité, opacité, échelle et rotation) pour l’utiliser comme guide. L’image n’est pas envoyée au serveur ni transformée en géométrie du drone.
- **Inspection de la scène** : projections, grille, accrochage, pas de grille, vue éclatée, X-ray/coupe conceptuelle et modes de rendus partagés avec la scène IDDS.
- **Historique et sorties** : commandes annuler/rétablir, export OBJ/STL et capture. Ces exports sont conceptuels et ne représentent pas un dossier de fabrication certifié.
- **Ergonomie** : ruban regroupé par familles d’outils, commandes accessibles, colonne latérale adaptative et hauteur du viewport plafonnée pour éviter que l’arbre ne pousse la scène hors cadre.

## Fichiers principaux

- `frontend/client/src/components/IDDSTwinAssemblyEditor.tsx` — interface, état local, commandes d’édition et inspector IDDS.
- `frontend/client/src/components/idds-mechanical-assembly.css` — identité visuelle et responsive de l’atelier IDDS.
- `frontend/client/src/components/DesignStudioView.tsx` — montage du composant IDDS dédié. L’interface complète du Digital Twin Explorer n’est pas importée dans l’atelier.
- `TODO.md` et `plan.md` — suivi et décisions du changement.

## Vérifications effectuées

- `pnpm check` : réussi, TypeScript et catalogues linguistiques synchronisés.
- `pnpm test` : **41 fichiers / 195 tests réussis**.
- `pnpm build:static` : réussi. Vite signale encore certains bundles supérieurs à 500 kB; c’est un avertissement d’optimisation, pas un échec de compilation.
- Contrôle navigateur sur la cellule de brouillon locale : ajout d’un bloc, arbre passé de **34 à 35 pièces**, puis annulation et retour à **34 pièces**. Canvas WebGL monté avec dimensions mesurables; la largeur du panneau et les colonnes s’adaptent à la sous-vue.
- Contrôle i18n : aucune nouvelle alerte attribuée à `IDDSTwinAssemblyEditor.tsx`. Le linter complet du dépôt signale encore des textes historiques dans d’autres composants (notamment Digital Twin Explorer et Mechanical Twin), hors de ce changement.

## Limites et périmètre

Les calques et les outils d’image s’inspirent du compositing et de la logique de calques d’un logiciel comme Photoshop; **ce livrable n’est pas un éditeur raster Photoshop** (pas de pinceaux, détourage, filtres photo ou édition pixel par pixel). La géométrie demeure un modèle mécanique conceptuel paramétrique, et non une CAO industrielle certifiée. Les résultats ne sont ni CFD/FEA, ni une qualification de vol. Les modifications de la prévisualisation restent locales; aucun déploiement dans un compte AeroMind distant n’a été effectué faute de connexion/cible de déploiement configurée.


## Prévisualisation

[Ouvrir l’application de prévisualisation](https://4173-ifjt8agfwz71bt9n3dewd-7791a9db.us4.manus.computer/). Le serveur temporaire sert le build statique courant; ouvrez **Bibliothèque de cellules → sélectionner une cellule → IDDS Studio → Assemblage numérique** pour atteindre l’atelier. Le lien est propre à cette session de prévisualisation et ne constitue pas une publication permanente dans le compte AeroMind.ai.
