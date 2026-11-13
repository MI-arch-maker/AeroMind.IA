# AeroMind — Rapport d’exécution du lot 4

**Date :** 31 octobre 2026  
**Lot :** conversion native des composants, congés/chanfreins CSG et commandes complètes  
**Statut :** livré, testé et prévisualisable

## Conversion des composants natifs

Toute pièce native du `MechanicalModel` possède déjà un maillage triangulé. Lorsqu’une pièce native est sélectionnée pour une opération CSG, ses sommets sont transformés dans le repère monde, convertis en solide JSCAD, ajoutés dans `mechanicalTwin.extraParts`, puis la pièce native d’origine est masquée via `mechanicalTwin.edits`.

Cette conversion est enregistrée dans `featureHistory` avec le nombre de sommets et de triangles source. La copie CSG devient donc éditable et réutilisable par les booléens et les traitements de bord.

## Congés et chanfreins

- **Congé** : traitement CSG par expansion arrondie JSCAD, segments contrôlés.
- **Chanfrein** : traitement CSG par enveloppe d’arête à faible segmentation, conservant un solide fermé et une reconstruction triangulée déterministe.

Les deux opérations sont accessibles dans la barre du Centre Paramétric, persistées dans l’historique et appliquées aussi bien aux pièces natives converties qu’aux features supplémentaires.

## Commandes vérifiées

Les commandes du Centre Paramétric sont reliées à une action observable :

- Nouveau réinitialise les features du profil actif ;
- Esquisse active/désactive le mode esquisse ;
- Extruder et Révolution reconstruisent des pièces ;
- Union, Découpe et Intersection utilisent le noyau JSCAD ;
- Congé et Chanfrein appliquent un traitement CSG à la pièce sélectionnée ;
- Mesurer, Masses, Paramètres viewport, Ajouter/Dupliquer variable affichent et modifient un état réel ;
- Import, Export, Valider, Capturer, plein écran, onglets, sélection de pièces et matériaux restent actifs.

Les toasts restants indiquent uniquement succès, erreur ou précondition et ne remplacent plus les commandes.

## Validation

- Typecheck TypeScript : réussi.
- Tests frontend : **68 fichiers, 328 tests réussis**.
- Tests CSG : booléen, conversion native, congé et chanfrein.
- Build Vite de production : réussi.
- Preview publique : HTTP 200 vérifié.

## URL de prévisualisation

https://3000-isxjadql64jdfr4nkhrpp-a32a466a.sg2.manus.computer/

## Limite géométrique explicitée

Le noyau JSCAD expose un opérateur geom3 robuste pour les offsets arrondis ; le chanfrein livré utilise une enveloppe CSG à faible segmentation pour rester compatible avec tous les maillages natifs fermés. Un algorithme de chanfrein arête-par-arête exact, ainsi que les lofts et congés variables par arête, nécessiteront un noyau B-Rep dédié si le cahier des charges exige cette précision industrielle.

Aucune commande matérielle ni opération de vol réelle n’a été activée.
