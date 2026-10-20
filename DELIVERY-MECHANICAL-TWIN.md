# AeroMind — Mechanical Twin / synchronisation effective du drone

Cette version corrige le défaut de la précédente : les outils C+A+B ne sont plus isolés dans leur interface. Ils écrivent dans la configuration du drone sélectionné et le rendu relit ces données.

## Calques réellement appliqués

Pour chaque pièce affectée à un calque, la configuration active du drone conserve l’affectation, la visibilité, le verrouillage, la couleur, l’opacité et l’annotation. La visibilité masque réellement la pièce dans le viewport WebGL et dans la projection vectorielle. La couleur et l’opacité sont également appliquées dans les deux rendus. La nomenclature et le pourcentage de complétude utilisent la même visibilité effective.

## Portée par drone

Le flux passe par la `ConceptConfig` de la cellule sélectionnée. Les affectations de calques et leurs métadonnées sont donc séparées par drone, comme les éditions géométriques paramétriques. Changer de drone ne réutilise pas les calques d’une autre cellule.

## Validation

- TypeScript : OK
- Tests : **40 fichiers, 189 tests réussis**
- Build statique : OK
- Archive ZIP : vérifiée
- Aperçu public : HTTP 200

> Les modèles, mesures, tolérances et statuts sont conceptuels et indicatifs. Ils ne constituent pas une qualification industrielle, une validation de fabrication ou une autorisation de vol.
