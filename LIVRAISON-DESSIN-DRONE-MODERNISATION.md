# Livraison — Atelier Dessiner le drone

## Modernisation

- Recomposition de l’atelier en espace professionnel AeroMind : en-tête, barre de commandes, palette d’outils, artboard, calques et inspecteur.
- Densité et espacements corrigés pour éviter l’empilement des écritures.
- Palette géométrique enrichie : polygone multi-rôle et canard avant, en plus des ailes, fuselages, empennages, triangles, hexagones, engrenages, hélices et formes libres.
- Outils conservés et mieux exposés : sélection multiple, déplacement, pan, grille, snap, symétrie, remplissage, pipette, cotation, annotation, duplication, rotation, mise à l’échelle et suppression.
- Calques professionnels : visibilité, verrouillage, ordre, opacité, fusion, exposition, contraste, saturation et balance des blancs.
- Synchronisation projet conservée via `customSketch`, sans données synthétiques ajoutées.
- Responsive desktop/tablette/mobile et raccourcis clavier conservés.

## Validation

- `pnpm run check` : OK.
- Tests géométrie et animation : OK.
- `pnpm run build` : OK.

## Correctif d’affichage

- La fenêtre workspace ne conserve plus sa largeur minimale de 420 px sur mobile.
- Le conteneur, la vue Design Studio et l’atelier Dessiner le drone acceptent désormais la largeur réelle du viewport.
- Les marges et le padding sont réduits sur petits écrans afin d’éviter le rendu en fine colonne.

## Correctif palette d’outils

- Ajout d’un container query basé sur la largeur réelle de l’atelier, indépendamment de la largeur globale du viewport.
- Les groupes de la palette passent en colonnes flexibles puis en empilement vertical propre lorsque la fenêtre est étroite.
- Tous les boutons ont désormais `min-width: 0`, les libellés sont tronqués proprement et aucun groupe ne peut déborder ou se superposer.

## Restauration de la palette verticale

- La palette reprend le comportement lisible de la version antérieure.
- Chaque outil apparaît sur sa propre ligne avec icône, nom et raccourci.
- La palette devient une colonne dédiée à gauche de l’artboard sur desktop.
- Sur une fenêtre étroite, elle reste verticale et défile indépendamment avant le canvas.
- Les outils ne sont plus compressés en mosaïque ni empilés visuellement.

## Version compacte et visuelle

- Les textes des boutons de la palette sont masqués pour réduire le cadre ; les titres et infobulles restent disponibles au survol.
- La palette conserve une colonne verticale d’icônes.
- La zone centrale est explicitement identifiée « VISUEL DU DESSIN » et agrandie.
- Les panneaux calques et inspecteur sont alignés sur la hauteur de l’espace visuel.
