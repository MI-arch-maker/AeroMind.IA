# Diagnostic et correction — drones issus de la bibliothèque IDDS

## Cause observée

Les formes de la cellule de bibliothèque étaient peintes comme une architecture catalogue fixe, tandis que les pièces effectivement éditables étaient dessinées par-dessus. Leur groupe ne réagissait qu’au clic (sélection) : les gestionnaires de pointeur/glisser existaient dans le composant mais n’étaient reliés à aucun SVG du workspace. L’utilisateur voyait donc le drone, sans pouvoir le déplacer au viewport. Les pièces catalogue successives partageant une même famille pouvaient aussi laisser la sélection précédente en mémoire, car le profil de cellule ne faisait pas partie de la signature de changement. Enfin, toutes les étiquettes des pièces apparaissaient sur une zone réduite.

## Correction

- Le viewport IDDS principal reçoit maintenant les événements pointer de sélection, déplacement, déplacement du canevas, relâchement et annulation ; les coordonnées déplacées sont transmises par la routine existante de synchronisation et d’historique.
- Le glisser est désactivé si une pièce est verrouillée ou si l’outil actif n’est pas l’outil de sélection, comme prévu par les contrôles existants.
- La mini-vue de la source demeure en lecture seule, tandis que le grand viewport est explicitement éditable.
- L’identifiant du profil catalogue est inclus dans la signature de changement de cellule afin de reconstruire l’assemblage de la bonne cellule lorsqu’un autre drone est choisi dans la même famille.
- Les noms et masses ne sont affichés que pour la pièce sélectionnée lorsque la silhouette de référence du catalogue est visible ; le rail de pièces permet de choisir les pièces qui se chevauchent.

## Vérifications

- `pnpm check` : réussi (catalogues synchronisés, TypeScript sans erreur).
- `pnpm test` : réussi — 41 fichiers, 195 tests.
- `pnpm build:static` : réussi.
- Test interactif du viewport sur la cellule locale DELUGE-E : glisser d’une pièce du catalogue modifie sa transformation SVG de `translate(500 280)` à `translate(550 308)` ; le pointer-up passe par la synchronisation de la configuration et de l’historique.
- Prévisualisation publique vérifiée HTTP 200.

La scène reste un éditeur de représentation paramétrique conceptuelle ; le déplacement ne constitue pas une édition B-Rep ni une validation industrielle.
