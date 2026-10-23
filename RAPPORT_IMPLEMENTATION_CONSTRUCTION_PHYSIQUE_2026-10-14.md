# AeroMind.ai — Rapport d’implémentation Construction Physique

## Résultat

L’interface existante **Construction Physique** a été reliée au workspace AeroMind.ai et remplace désormais son premier atelier générique par une vue intégrée en trois zones :

1. **Bibliothèque drones** : modèles du catalogue réel, modèle de référence dédié et action « Créer mon drone ».
2. **Visualiseur central** : scène Three.js / React Three Fiber manipulable par orbite et zoom, grille bleu pétrole, éclairage volumétrique et géométrie distincte par composants.
3. **Inspecteur** : apparence, matériaux, visibilité des composants, vue filaire, fiche active et variantes locales.

## Modèle intégré

- Identifiant stable : `aeromind-reference-multirotor-001`
- Nom : `Drone à carénage ovale — Référence`
- Catégorie : multirotor / maquette de conception physique
- Configuration indicative implémentée : **6 rotors** disposés de façon cohérente autour du corps central
- Composants visuels distincts : corps ovale aplati, bras/supports, moyeux, rotors, élément sphérique turquoise supérieur et module orange
- Limite documentée : la source est une image d’interface ; les dimensions et performances ne sont pas mesurées ni certifiées

## Synchronisation

- La sélection d’un modèle dans Construction Physique met à jour `ConceptConfig.platformProfile`, `modelType`, `airframe`, `designName`, `missionBrief` et `engineeringSelection`.
- Les réglages visuels sont conservés dans `ConceptConfig.physicalAppearance` et suivent le snapshot workspace existant.
- L’interface Dessiner conserve son fonctionnement et continue d’utiliser `customSketch` comme source de données du projet.
- Les autres profils du catalogue sont conservés ; le catalogue compte désormais 61 profils, dont l’entrée de référence.

## Fichiers modifiés

- `frontend/client/src/lib/droneCatalog.ts`
- `frontend/client/src/lib/aeroEngine.ts`
- `frontend/client/src/pages/StrataStudio.tsx`
- `frontend/client/src/pages/Home.tsx`
- `frontend/client/src/index.css`
- `frontend/vite.config.ts`
- `frontend/client/src/lib/droneCatalog.test.ts`
- `frontend/client/src/lib/longRangeObservation.test.ts`
- `frontend/client/public/assets/aeromind-reference-source.png`

## Vérifications effectuées

- `pnpm run check` : réussi
- `pnpm test -- --run` : **28 fichiers, 139 tests réussis**
- `pnpm run build` : réussi
- Le build signale uniquement des avertissements de taille de bundle préexistants liés aux modules volumineux ; aucune erreur de compilation.

## Fonctions non prétendues

- Pas de maillage CAO, GLB ou STL certifié.
- Pas de dimensions mécaniques déduites de l’image.
- Pas de validation de fabrication, de vol ou de certification.
- Pas de synchronisation collaborative multi-utilisateur CRDT ; le projet utilise les mécanismes workspace/localStorage/BroadcastChannel déjà présents.
- Les fonctions restent en simulation et en préparation de conception ; aucune sortie matérielle n’est activée.

## Correction du 14 octobre — rendu obligatoire du modèle actif

La prévisualisation a été corrigée après revue de l’interface :

- le fallback sans WebGL ne montre plus une silhouette générique ; il affiche une géométrie paramétrée par le drone actif et son nombre de rotors ;
- le modèle de référence possède un rendu spécifique avec carénage, rotors, capteur turquoise et module orange ;
- lorsqu’un projet contient `customSketch.strokes`, le visualiseur affiche les traits réellement enregistrés par l’atelier **Dessiner** ;
- le rendu WebGL utilise également ces traits synchronisés au lieu de forcer le modèle de catalogue ;
- la sélection depuis la bibliothèque et la sélection issue du dessin restent donc visibles dans la zone centrale.
