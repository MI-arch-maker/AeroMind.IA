# AeroMind v2.2 — Rapport de diagnostic Phase 0

**Statut :** diagnostic terminé avant implémentation  
**Périmètre :** rendus modifiables multi-vues R1 à R6, Studio de Conception, Poste de Construction, vue principale  
**Source analysée :** archive AeroMind restaurée et état de travail courant  
**Date :** 2026-10-13

## DIAG-R1 — Production du rendu actuel

### Rendu 3D actuel

Le rendu 3D actuel est produit par `frontend/client/src/components/PhysicalDroneModel.tsx` avec React Three Fiber, Three.js et `@react-three/drei`.

- `DroneMesh` construit une géométrie composée de primitives Three.js (`capsuleGeometry`, `boxGeometry`, `cylinderGeometry`, `coneGeometry`, `extrudeGeometry`).
- La branche morphologique est déterminée par `design.key`, `design.modelType` et quelques paramètres de `design.configuration`.
- Les profils spécialisés existants incluent notamment `blended-pusher`, `stealth-wing`, `hale-voilure` et `male-voilure`.
- Les pièces installées sont ajoutées comme petits objets distincts à partir de `parts` / `InstalledMaterial`.
- La caméra et les lumières sont définies dans `Scene`; `OrbitControls` fournit l’orbite et le zoom.
- Le composant possède déjà un repli lorsque WebGL2 est indisponible et limite le nombre de contextes WebGL simultanés.

### Rendu principal et Poste de Construction

Le Poste de Construction (`ConceptView` dans `Home.tsx`) affiche actuellement `ParametricDronePreview`, un SVG paramétrique alimenté par le profil actif et une configuration fusionnée. Il expose un zoom visuel, mais pas un éditeur de paramètres aéronautiques complet.

Le Studio de Conception (`DesignStudioView.tsx`) contient déjà :

- une vue SVG manipulable pour les pièces et annotations ;
- un mode physique utilisant `EngineeringDronePlate` ;
- une nomenclature `StudioPart[]` convertie en `InstalledMaterial[]` ;
- des mutations qui écrivent via `setConfig` dans la configuration du projet.

### Cause racine de la déconnexion v2.2

Le rendu est principalement piloté par des projections locales (`design`, `config`, `parts`) et des états d’affichage propres aux composants. Il n’existe pas encore de schéma aéronautique versionné dédié aux six rendus, ni de registre commun `renderMode`/`renderState` consommé par des modules R1 à R6.

Les valeurs de géométrie sont réparties entre :

- `ConceptConfig` dans `aeroEngine.ts` ;
- `DroneCatalogDesign.configuration` dans `droneCatalog.ts` ;
- `InstalledMaterial` pour les composants ;
- les fonctions locales de dimensionnement dans `DesignStudioView.tsx` ;
- des valeurs de forme et d’échelle codées dans les composants SVG/Three.js.

Conséquence : une modification peut mettre à jour la configuration et certains composants, sans garantir que toutes les projections ouvertes se régénèrent depuis une représentation aéronautique unique.

## DIAG-R2 — Morphologies existantes et schéma de stockage

### Configuration projet actuelle

`ConceptConfig` contient déjà les champs centraux suivants :

- géométrie : `wingspan`, `chord`, `fuselageLength`, `propDiameter` ;
- propulsion/énergie : `motorCount`, `batteryWh`, `propDiameter` ;
- charge et mission : `payloadKg`, `cruiseSpeedKmh`, `altitudeM` ;
- architecture : `airframe`, `modelType`, `designName`, `platformProfile` ;
- construction : `constructionMassKg`, `installedMaterials`, `studioLayers` ;
- commande et plan local : `flightControls`, `missionPlan`, `missionEnvironment`.

### Catalogue de morphologies

`frontend/client/src/lib/droneCatalog.ts` contient les variantes sélectionnables sous forme de `DroneCatalogDesign` :

- `key` : architecture (`fixed-wing`, `quadcopter`, `vtol`) ;
- `modelType` : morphologie spécialisée ;
- `id`, `label`, `family`, `mission` ;
- `configuration` : sous-ensemble de `ConceptConfig` ;
- métadonnées de catalogue, ton visuel et provenance documentaire.

Les variantes de voilure fixe comprennent notamment les profils `mantis-x-*`, les profils `wing-*`, `tandem-*`, `canard-*`, `hale-voilure`, `male-voilure`, `stealth-wing` et `blended-pusher`. Le profil est actuellement restauré dans `config.platformProfile` et fusionné avec `config` au moment du rendu.

### Composants

`InstalledMaterial` contient déjà les informations de nomenclature et d’affichage :

- identité et masse : `id`, `label`, `massKg`, `quantity` ;
- catégorie : airframe, propulsion, energy, avionics, payload, etc. ;
- position de maquette : `offsetX`, `offsetY` ;
- échelle visuelle : `scale` ;
- provenance et statut documentaire ;
- connexions logiques de banc virtuel, sans connexion matérielle réelle.

### Persistance et synchronisation existantes

`projectSyncStore.ts` expose un workspace Zod versionné (`PROJECT_SCHEMA_VERSION = 2`) et valide :

- configuration du projet ;
- projets et projet actif ;
- exigences ;
- source `LOCAL` / `SERVER-ACK` ;
- statut `LOCAL`, `SERVER-ACK`, `PENDING SYNC`, `ERROR` ;
- garde-fou `physicalOutputEnabled: false`.

Le store actuel est une base correcte pour intégrer le schéma aéronautique, mais il ne contient pas encore :

- `aircraft.version` dédié ;
- stations de profil d’aile ;
- empennages structurés ;
- positions 3D normalisées des composants ;
- sélection persistée d’un des six rendus ;
- état de recalcul et provenance par rendu.

## DIAG-R3 — Conclusion et plan de fondation

Le problème v2.2 n’est pas l’absence totale de rendu 3D : c’est l’absence d’un **contrat aéronautique normalisé et partagé** entre les rendus. La correction doit donc commencer par :

1. définir un schéma Zod versionné `aircraft` ;
2. migrer sans perte `ConceptConfig`, le profil catalogue et `InstalledMaterial` ;
3. centraliser les mutations validées ;
4. persister le mode de rendu et l’état de variante dans le workspace ;
5. créer six modules indépendants consommant le même snapshot ;
6. ajouter les tests de propagation avant de déclarer une exigence `[✓]`.

### Garde-fous à préserver

- aucune écriture `arm`, `actuator-write` ou `mission-upload` ;
- `physicalOutputEnabled` reste strictement `false` ;
- les masses et centrages sont des estimations documentaires ;
- les stations aérodynamiques ne sont jamais présentées comme des mesures CFD ;
- toute synchronisation doit exposer sa source et son état réel ;
- aucune sélection de rendu ne doit dépendre d’une authentification ou d’un projet serveur.

**Conclusion Phase 0 :** [✓] DIAG-R1, [✓] DIAG-R2, [✓] DIAG-R3.  
Aucune implémentation v2.2 n’a été effectuée avant la livraison de ce rapport.
