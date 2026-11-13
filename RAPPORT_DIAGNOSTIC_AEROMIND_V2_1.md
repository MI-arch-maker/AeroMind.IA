# Rapport de diagnostic — AeroMind v2.1

**Phase :** 0 — Diagnostic obligatoire  
**Date :** 13 octobre 2026  
**Périmètre :** Poste de Construction, Studio de Conception, vue principale AeroMind, persistance locale et propagation inter-onglets.

## 1. Cartographie du flux actuel

### 1.1 Source d’état principale observée

La vue `frontend/client/src/pages/Home.tsx` possède l’état React central suivant :

- `project` : métadonnées du projet ;
- `requirements` : exigences de mission ;
- `config` : `ConceptConfig`, consommé par la simulation, les vues live, le Centre aéronautique et les opérations ;
- `runId` : identifiant de simulation ;
- `projects` et `activeProjectId` : sélection et collection de projets.

La vue principale passe `config` et `setConfig` à plusieurs modules, notamment :

- `ConceptView` / Poste de Construction ;
- `InspectorView` ;
- `SimulationView` ;
- `LiveSimulationView` ;
- `MissionOperationsView` ;
- `MaterialsAssemblyView` ;
- `AeronauticalCenterView` ;
- `DesignStudioView`.

**Constat :** il existe un état React partagé dans `Home`, mais pas de store versionné indépendant avec validation de schéma. Les composants écrivent directement via `setConfig({...config, ...})`.

### 1.2 Poste de Construction

| Donnée modifiable | Stockage actuel | Lecteurs | Propagation | Rupture |
| --- | --- | --- | --- | --- |
| Architecture, dimensions, batterie, charge, vitesse, masse | `config` React dans `Home` | simulation, preview, Centre aéronautique, live, opérations | `setConfig` puis effet de sauvegarde Home | validation de schéma absente ; erreurs de persistance avalées |
| Pièces / matériaux installés | `config.installedMaterials`, parfois état local d’éditeur | simulation, exports, Studio | propagation indirecte via `config` | aucune source de vérité formalisée pour les métadonnées de construction |
| Paramètres de mission | `config.missionPlan`, `config.flightControls` | MissionOperations, FlightOperationsModules, simulation | `setConfig` | pas de journal de synchronisation structuré |

### 1.3 Studio de Conception

`DesignStudioView.tsx` conserve en plus un état local important :

- `parts` / `partsRef` ;
- `annotations` ;
- `customLayers`, visibilité et verrous ;
- historique `past` / `future` ;
- zoom, vue, outil, sélection et géométrie d’édition.

Les fonctions `commit`, `syncConfig`, `changeSelected`, `addCatalogPart`, `importStudio`, `undo` et `redo` reconstruisent ensuite partiellement `ConceptConfig` et appellent `setConfig`.

**Ruptures exactes :**

1. Les pièces, annotations et paramètres d’édition sont détenus localement par le Studio ; seule une projection partielle (`installedMaterials`, `studioLayers`, `constructionMassKg`) remonte dans `config`.
2. Une modification visuelle comme position, largeur, hauteur, rotation ou contrainte d’une pièce ne possède pas de schéma projet partagé consommé par AeroMind.
3. L’état local des pièces est réinitialisé selon `config` et `activeProfile`, ce qui peut recréer une nomenclature de départ après restauration.
4. Les modifications de calques et certaines annotations ne sont pas intégrées au snapshot métier global.

### 1.4 Vue AeroMind / simulation

La vue principale consomme directement `config` depuis `Home` et recalcule `simulation` avec :

```ts
runSimulation(config, requirements, runId)
```

Les lecteurs sont donc réactifs **dans le même montage React**. Le défaut de propagation se manifeste lorsqu’un module n’est pas monté dans le même état, après restauration, ou lorsqu’une écriture locale échoue silencieusement.

## 2. Schéma consommé versus schéma produit

### 2.1 Schéma consommé par la simulation

La simulation consomme `ConceptConfig`, notamment :

- architecture : `airframe`, `modelType`, `platformProfile`, `designName` ;
- géométrie : `wingspan`, `chord`, `fuselageLength`, `propDiameter` ;
- propulsion et énergie : `motorCount`, `batteryWh`, `payloadKg`, `cruiseSpeedKmh`, `reserveFraction` ;
- environnement : `windSpeedKmh`, `altitudeM`, `missionEnvironment` ;
- construction : `installedMaterials`, `constructionMassKg` ;
- commande et mission : `flightControls`, `missionPlan` ;
- Studio : `studioLayers` et métadonnées associées.

### 2.2 Schémas produits par les éditeurs

Le Poste de Construction produit des patches partiels compatibles avec `ConceptConfig`, mais sans validation runtime.

Le Studio produit :

```ts
{
  parts: StudioPart[],
  annotations: Annotation[],
  customLayers: string[],
  config?: ConceptConfig,
  view?: ViewMode,
  zoom?: number
}
```

puis projette seulement une partie vers `ConceptConfig` via `partsToMaterials()`.

**Incompatibilités constatées :**

- `StudioPart[]` n’est pas un champ de `ConceptConfig` ;
- `annotations`, positions et dimensions graphiques ne sont pas consommées par la simulation ;
- les imports Studio peuvent fusionner `payload.config` sans validation ;
- il n’existe aucun champ `schemaVersion` ou enveloppe de projet commune.

## 3. LocalStorage et BroadcastChannel

### 3.1 Clés observées

- `aeromind-blank-workspace-v3` : snapshot global Home ;
- `aeromind-labbench-state-v1` : état LabBench ;
- clés propres à `WorkspaceWindow`, `ThemeContext` et `LabBenchHardwareConfig` ;
- `aeromind-workspace-sync` : canal BroadcastChannel global.

### 3.2 Événements observés

`workspaceSync.ts` définit :

- `{ type: "workspace", payload }` ;
- `{ type: "view", view }` ;
- `{ type: "labbench", payload }`.

Home publie le snapshot global après modification de `project`, `requirements`, `config` ou `runId`. Home écoute `storage` et `BroadcastChannel`.

### 3.3 Ruptures de câblage

1. `persistAndPublish()` existe mais Home écrit directement dans `localStorage` et appelle directement `publishWorkspaceMessage`; l’abstraction commune n’est pas réellement utilisée de bout en bout.
2. `readPersistedState()` attrape toute erreur JSON ou schéma et retourne `emptyWorkspace`, ce qui produit précisément le fallback vierge silencieux interdit par PERSIST-05.
3. L’écriture vers `/api/local/workspace` existe dans Home, mais aucune route backend correspondante n’a été trouvée. Le serveur tombe donc sur la route SPA qui refuse `/api/*` ou renvoie une erreur, sans contrat JSON dédié.
4. Les messages BroadcastChannel ne contiennent ni version de schéma, ni horodatage de mutation, ni identifiant d’auteur, ni source `LOCAL` / `SERVER-ACK`.
5. La réception d’un état externe applique directement `setProject`, `setConfig` et `setRequirements` sans validation ; une donnée non conforme peut être acceptée jusqu’à provoquer une incohérence de rendu.
6. Aucun mécanisme de résolution de conflit « dernière écriture horodatée gagnante » n’est présent.
7. Aucun statut global permanent `SYNCHRONISÉ (LOCAL)`, `SYNCHRONISÉ (SERVEUR)` ou `ERREUR DE SYNCHRONISATION` n’est relié à un accusé serveur réel.

## 4. Points de rupture prioritaires

| ID | Point de rupture | Impact |
| --- | --- | --- |
| BR-01 | Pas de store projet versionné et validé | écritures concurrentes et schémas implicites |
| BR-02 | État local `parts` du Studio partiellement projeté | la vue principale ne voit pas toute la modification Studio |
| BR-03 | `readPersistedState()` transforme toute corruption en workspace vierge | perte apparente de données et échec silencieux après F5 |
| BR-04 | `/api/local/workspace` absent du backend | sauvegarde locale serveur impossible, erreur masquée |
| BR-05 | Messages inter-onglets sans horodatage/version/source | écrasement non détecté et conflits non déterministes |
| BR-06 | Erreurs `localStorage` et API remplacées par état « saved » | faux succès de synchronisation |
| BR-07 | Aucun schéma runtime de `ConceptConfig`/workspace | valeur invalide non rejetée avec conservation de l’ancienne valeur |
| BR-08 | Pas de matrice E2E Playwright | les scénarios F5, deux onglets et corruption ne sont pas couverts automatiquement |

## 5. Diagnostic de la cause du défaut utilisateur

Le défaut n’est pas l’absence totale de `setConfig` : dans un montage React unique, plusieurs modifications se reflètent déjà immédiatement. La panne apparaît quand la modification traverse une frontière de module ou de cycle de vie :

1. le Studio maintient une représentation locale plus riche que `ConceptConfig` ;
2. seule une projection partielle est remontée ;
3. la persistance et la restauration n’ont pas de validation de schéma ;
4. l’API locale appelée n’existe pas ;
5. les erreurs sont converties en état apparemment enregistré ;
6. les événements inter-onglets n’ont ni version, ni conflit, ni accusé.

## 6. État de conformité Phase 0

- [✓] **DIAG-01** — Cartographie des champs modifiables, stockages, lecteurs et ruptures.
- [✓] **DIAG-02** — Comparaison du schéma `ConceptConfig` consommé avec les états `StudioPart[]` et patches éditeur.
- [✓] **DIAG-03** — Vérification des clés `localStorage`, du canal BroadcastChannel et des écouteurs.
- [✓] **DIAG-04** — Rapport de diagnostic produit avant toute modification de code.

## 7. Choix recommandé pour la Phase 1

Choix : **Context React optimisé + schéma Zod versionné**, sans nouvelle dépendance de store externe.

Justification : `Home` possède déjà l’état projet et tous les éditeurs reçoivent `config`/`setConfig`. Extraire un `ProjectStoreProvider` typé permet de centraliser les mutations sans introduire une seconde infrastructure, tout en réutilisant Zod déjà présent dans les dépendances frontend.

La Phase 1 devra exposer une API de mutations validées (`patchConfig`, `replaceProject`, `patchMission`, `patchConstruction`) et inclure une enveloppe persistée versionnée avec `updatedAt`, `source`, `syncStatus` et `physicalOutputEnabled: false`.
