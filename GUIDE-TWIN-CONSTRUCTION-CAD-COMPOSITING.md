# AeroMind — Twin Construction + CAO + Compositing

## Intégration livrée

La combinaison approuvée **C + A + B** est intégrée dans le `MechanicalTwinEditor` sous la forme d’un dock inférieur relié au même modèle paramétrique.

### Assembler — direction C

L’onglet **ASSEMBLER** dérive une nomenclature de revue depuis les pièces visibles du modèle. Chaque pièce possède un statut cyclique : `À définir`, `À commander`, `Monté`, `Inspecté`. Un matériau peut être associé depuis les matériaux installés dans le workspace. Les données sont conservées localement par cellule et restent distinctes d’une commande physique ou d’une validation de fabrication.

### CAO / Revue — direction A

L’onglet **CAO / REVUE** expose une mesure dérivée de la pièce sélectionnée ou de l’envergure, une tolérance indicative, un repère d’unité, une coupe de revue et des variantes locales. Les variantes enregistrent l’envergure, la longueur, le nombre de motorisations et la date. Les mesures et tolérances ne constituent pas un tolérancement industriel certifié.

### Calques — direction B

L’onglet **CALQUES** permet de créer manuellement des calques, de les sélectionner, masquer, verrouiller et supprimer. Une pièce sélectionnée peut être affectée au calque actif. La suppression d’un calque retire l’affectation mais conserve la pièce et la nomenclature. Aucun calque n’est créé automatiquement par le modèle mécanique.

## Persistance et limites

Les statuts d’assemblage, associations de matériaux et variantes de revue sont stockés dans `localStorage` sous une clé propre à la cellule. Les calques et leurs affectations utilisent les champs existants de `ConceptConfig`, afin de rester disponibles aux autres ateliers qui lisent le workspace.

Le rendu reste un **modèle conceptuel paramétrique** : aucune commande matérielle, aucun téléversement de mission, aucun actionneur, aucune validation de vol, aucun fichier STEP/IGES industriel et aucune certification ne sont introduits par cette intégration.

## Validation de la copie livrée

- `pnpm check` : réussi ;
- `pnpm test -- --run` : **40 fichiers / 189 tests réussis** ;
- `pnpm build:static` : réussi ;
- aperçu public : HTTP 200 ;
- vérification navigateur : scène vide sans injection, chargement explicite d’une Matrice 350 RTK, présence du dock `ASSEMBLER / CAO / REVUE / CALQUES`, scène 3D paramétrique conservée.
