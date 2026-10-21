# Plan de mise à jour — Twin Construction, CAO et Compositing

## Décision approuvée

L’utilisateur a choisi la combinaison **C + A + B** :

- **C — Assembly & Materials Twin** : nomenclature, matériaux, séquence d’assemblage, inspection et traçabilité locale ;
- **A — AeroCAD Parametric** : arborescence, cotations, mesures, coupes et variantes ;
- **B — Twin Compositing Studio** : calques manuels, annotations, visibilité/verrouillage et états de revue.

## Périmètre d’implémentation

Réutiliser `MechanicalTwinEditor`, `MechanicalTwinViewport`, le modèle de géométrie paramétrique et `ConceptConfig`. Ajouter un dock intégré au Mechanical Twin avec trois espaces de travail liés au même modèle :

1. **Assembler** : nomenclature générée depuis les pièces du modèle, statut local par pièce, matériau associé, progression et vérifications visibles ;
2. **CAO / Revue** : mesures dérivées de la géométrie, référence de cote, tolérance indicative, coupe X-ray et variantes locales ;
3. **Calques / Compositing** : calques manuels persistants, visibilité, verrouillage, couleur d’accent, affectation de la pièce sélectionnée et journal d’état.

Les données de travail sont rattachées à l’identifiant de la cellule et stockées dans la configuration existante quand elles sont partagées ; les préférences d’onglet, de caméra et les brouillons de revue restent locaux. Les valeurs sont présentées comme indicatives/conceptuelles.

## Design

- **Mouvement** : poste d’ingénierie aérospatiale sombre, croisé avec un studio de création technique ;
- **Principes** : même source géométrique, opérations réversibles, séparation claire entre maillage procédural et nomenclature, limites toujours visibles ;
- **Couleur** : graphite/carbone pour la scène, cyan pour la géométrie, ambre pour la fabrication, violet discret pour les calques ;
- **Disposition** : viewport central existant, dock inférieur à onglets pour éviter de diluer l’inspecteur mécanique ;
- **Signature** : sélecteur `ASSEMBLER / CAO / CALQUES`, barre de complétude, statuts de pièces et indicateur `CONCEPTUEL / NON CERTIFIÉ` ;
- **Interaction** : chaque opération met à jour le même modèle, sans création automatique de pièces ou de calques cachés ;
- **Typographie** : conserver Inter et les labels monospace techniques existants.

## Structure concernée

- `frontend/client/src/components/MechanicalTwinIntegrationDock.tsx` : dock C+A+B ;
- `frontend/client/src/components/MechanicalTwinEditor.tsx` : branchement du dock au modèle et à la pièce sélectionnée ;
- `frontend/client/src/components/mechanical-twin.css` : styles du dock, des états et du responsive ;
- `frontend/client/src/lib/aeroEngine.ts` : réutilisation des champs de configuration existants `installedMaterials`, `studioLayers`, `studioLayerSettings`, `activeStudioLayer` ;
- `TODO.md` : critères d’acceptation et validation.

## Limites conservées

Le Twin reste un modèle mécanique conceptuel paramétrique. Cette tranche ne crée pas de noyau B-Rep, STEP/IGES, CFD/FEA, tolérancement industriel certifié, validation de fabrication ou commande physique. Les couples, matériaux, masses et statuts de construction sont indicatifs ou saisis par l’utilisateur.


## Extension — rendus personnalisés Studio IDDS

- La barre de rendus remplace l’indication « Aperçu 2D » par cinq modes : assemblage complet, détails internes, cinématique, simulation paramétrique et variantes paramétriques. Le viewport et l’inspecteur restent liés aux pièces de la même cellule active.
- Le mode cinématique expose la lecture/pause visuelle ; le mode simulation fait varier interactivement l’envergure, la longueur et le nombre de motorisations du document actif ; le générateur crée des alternatives de ces paramètres et leur sélection applique la variante au même document.
- Les vues et données existantes sont conceptuelles ; aucune commande matérielle, qualification, ni validité d’ingénierie certifiée n’est ajoutée. Les variantes générées sont conservées dans l’état de la session du Studio, tandis que les paramètres actifs suivent la synchronisation `ConceptConfig`.


## Extension — atelier de conception approfondi IDDS

- **Architecture** : faire évoluer uniquement `IDDSTwinAssemblyEditor`; garder `DigitalTwinExplorer`/`MechanicalTwinEditor` séparés. Les deux partagent seulement le générateur mécanique et le viewport 3D bas niveau.
- **Interaction CAO** : barre de commandes organisée par sélection, translation, rotation, échelle et mesure; édition numérique XYZ, pas d’accrochage, copie/suppression de pièces utilisateur, ajout de formes paramétriques et historique annuler/rétablir, tous reliés à `ConceptConfig`.
- **Calques/compositing** : créer, affecter, masquer, verrouiller et régler l’opacité/couleur des calques; importer une image de référence locale et régler sa visibilité, son opacité, son échelle et sa rotation comme guide visuel sans la confondre avec une géométrie certifiée.
- **Assemblage/paramètres** : afficher les dimensions principales, régler les paramètres structuraux avancés et la finition, exporter le maillage conceptuel en OBJ/STL, manipuler vues/projections, coupe X-ray, éclatement et cinématique depuis la barre IDDS.
- **Design** : conserver l’esthétique d’atelier aérospatial sombre/cyan, mais enrichir la hiérarchie comme un logiciel de compositing/CAO : commandes groupées, rail d’outils, arbre de scène, zone de travail centrale et inspecteur contextuel; actions réversibles, statut conceptuel explicite et mise en page responsive.
- **Limites** : l’image importée reste locale au navigateur; ces outils éditent une maquette paramétrique conceptuelle et n’ajoutent ni noyau B-Rep, solveur CFD/FEA, certification ni commande matérielle.


## Extension — navigation cartographique et démonstration civile locale

L’écran satellitaire conserve les couches cartographiques et les brouillons WGS84 enregistrés localement. Les points deviennent des points d’inspection renommables. Un filtre visuel nocturne transforme uniquement les couleurs des tuiles et ne représente pas une donnée de capteur. Un lecteur local, exigeant au moins deux points, anime un marqueur synthétique avec pause/reprise/fin/réinitialisation et barre de progression; il ne produit aucune sortie réseau de pilotage.

La télémétrie MAVLink demeure en lecture seule. Aucun armement, ciblage, poursuite, commande physique, GNSS embarqué, téléversement de mission ou changement de protocole ne fait partie du périmètre. Les fichiers concernés sont `SatelliteNavigationView.tsx`, `OpenStreetMapView.tsx`, les styles cartographiques et les tests d’interpolation.
