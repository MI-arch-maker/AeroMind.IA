# Correction — séparation architecturale Digital Twin Explorer / Studio IDDS

## Ce qui n’allait pas dans la livraison précédente

J’avais monté `MechanicalTwinEditor` dans les deux parcours. Même si leurs données étaient synchronisées, le **Digital Twin Explorer** et le **Studio IDDS** partageaient le même éditeur complet : ils n’étaient donc pas distincts architecturalement. C’était une mauvaise interprétation de la demande.

## Séparation maintenant appliquée

Le **Digital Twin Explorer** conserve son architecture existante : `DigitalTwinExplorer` orchestre ses sections, son contexte de projet, son arbre d’exploration et le composant complet `MechanicalTwinEditor`. Son fichier et son parcours n’ont pas été remplacés par le nouvel éditeur IDDS.

Le **Studio IDDS** utilise désormais un composant dédié, `IDDSTwinAssemblyEditor`. Il possède sa propre mise en page d’assemblage, son arbre de pièces, son inspecteur paramétrique, ses contrôles de couches et de coupe X-ray, ainsi que ses projections et commandes de vue éclatée. Il ne monte pas `MechanicalTwinEditor`. La barre IDDS garde les cinq rendus demandés : assemblage complet, détails internes, cinématique, simulation paramétrique et génération de variantes.

Les deux architectures peuvent partager les primitives techniques de bas niveau — `buildMechanicalModel` pour générer le maillage et `MechanicalTwinViewport` pour l’affichage/sélection 3D — mais elles ont des composants d’orchestration, des panneaux et des états d’interface distincts. Les edits IDDS restent reliés à la configuration de la cellule sélectionnée.

## Cause du rendu qui semblait figé

L’ancien atelier dessinait certaines cellules en silhouettes SVG/CSS 2D sans relier cette image au maillage inspecté. Les interactions de façade ne reconstruisaient donc pas le drone visible. Le poste d’assemblage IDDS affiche maintenant le maillage paramétrique 3D; l’arbre sélectionne les pièces du maillage et l’inspecteur applique les modifications à la configuration mécanique.

## Validation de cette correction

Le contrôle TypeScript et la synchronisation des catalogues i18n sont réussis. Les tests donnent **41 fichiers et 195 tests réussis**; le build statique réussit aussi. Le bundler conserve un avertissement non bloquant concernant la taille de certains bundles. Le contrôle visuel de l’aperçu montre le titre et la disposition propres à l’éditeur IDDS, avec son arbre de 34 pièces et son inspecteur distinct. Le code du Digital Twin Explorer continue de monter son propre `MechanicalTwinEditor`.

L’URL de prévisualisation répond HTTP 200 : `https://4173-ifjt8agfwz71bt9n3dewd-7791a9db.us4.manus.computer/`.

## Limites

Les rendus sont conceptuels et non certifiés. La simulation paramétrique de l’IDDS modifie la géométrie et les paramètres locaux; elle n’est ni un solveur CFD/FEA ni une qualification de vol. La cinématique dépend de WebGL. Les changements sont dans le brouillon navigateur de l’aperçu, sans publication vers un projet de production.
