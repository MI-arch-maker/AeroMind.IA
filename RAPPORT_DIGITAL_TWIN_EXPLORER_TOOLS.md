# AeroMind — remplacement par le poste FORGE

**Date :** 16 octobre 2026  
**Statut :** intégré dans le Digital Twin Explorer; l’ancienne composition de la sous-vue a été remplacée.

## Architecture intégrée

La sous-vue utilise désormais la structure FORGE :

1. **Barre supérieure** : Sélection, Dessin, Déplacer, Correction, Créer, projection, rendu, annuler/rétablir et menu d’analyse/export.
2. **Colonne gauche** : arborescence filtrable des pièces paramétriques, ajout de modules/cylindres, calques avec état visible/verrouillé, compte d’objets et création de calque depuis la pièce sélectionnée.
3. **Scène centrale** : viewport du jumeau avec projections, rendus, sélection et inspection mécanique conservés.
4. **Inspecteur droit** : édition de dimensions, déplacement, rotation, échelle, apparence et visibilité de la pièce.
5. **Bas d’atelier** : historique/révisions, comparer/restaurer, puis panneau d’impact de la modification.

La création de calque est reliée à la géométrie sélectionnée : l’affectation est écrite dans `studioLayerAssignments`; visibilité/verrouillage et calque actif restent éditables depuis l’arborescence. Les anciens panneaux empilés, barres d’outils dupliquées, dock d’intégration et palette de prototype précédente ont été retirés de cette sous-vue.

## Validation

- Vérification TypeScript et catalogue i18n : réussie.
- Suite de tests précédente sur la même base d’outils : **41 fichiers, 195 tests réussis**; depuis l’adaptation FORGE, contrôle TypeScript et build de production réussis.
- Preview statique : HTTP 200, build servi; le service API ou la persistance distante n’est pas couvert par cette vérification.

## Limites

Les corrections et transformations restent des opérations conceptuelles sur le maillage paramétrique local, pas une CAO certifiée. Le menu Fabrication exporte les formats disponibles; cette prévisualisation ne certifie ni contraintes, résistance structurelle, ni sécurité de vol. Le statut de synchronisation/backend demeure celui du projet existant.
