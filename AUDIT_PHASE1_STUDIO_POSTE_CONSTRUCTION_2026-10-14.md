# AeroMind — audit phase 1
## Studio de conception avancée et Poste de construction universel

**Date :** 14 octobre 2026  
**Périmètre :** `/home/ubuntu/work_aeromind`  
**Mode :** lecture seule sur l’application ; aucun composant applicatif modifié pendant cette phase.  
**Objectif :** établir l’architecture réelle, les capacités vérifiables, les écarts du cahier des charges et le plan d’intégration avant toute nouvelle modification.

## 1. Verdict exécutif

AeroMind possède déjà une base solide pour construire les deux modules demandés :

- `DesignStudioView` fournit un studio SVG paramétrique avec pièces sélectionnables, calques, contraintes, outils de mesure/annotation, historique undo/redo, export OpenSCAD/JSON/BOM et prévisualisation 3D WebGL/CSS de compatibilité.
- `VirtualAssemblyWorkshop` fournit un poste d’assemblage visuel avec vues assemblée/éclatée/relations, bibliothèque filtrable et ajout de composants au `ConceptConfig` partagé.
- `DroneSketchProWorkbench` fournit le dessin avancé SVG, les composants paramétriques, la sélection, le déplacement, les gradients, la symétrie et la persistance dans `customSketch`.
- `projectSyncStore.ts` fournit un snapshot Zod v2, `localStorage`, `BroadcastChannel` et un verrou `physicalOutputEnabled: false`.
- Le workflow versionné backend/frontend fournit désormais un premier transfert prototype → run → rejeu → rapport avec hash, version immuable et niveau de preuve explicite.

**Conclusion :** les interfaces de conception et d’assemblage sont avancées visuellement et partiellement opérationnelles. Elles ne constituent pas encore un système CAO/PLM universel ni un vérificateur d’intégration complet. Les fonctions actuellement absentes ou non démontrées sont principalement : compatibilité multi-critères, connexions persistantes, architecture réellement extensible avec règles propres, validation serveur du modèle de composants, nomenclature sans lignes conceptuelles ambiguës, historique serveur complet et test navigateur de bout en bout.

## 2. Preuves exécutées pendant cette phase

| Contrôle | Résultat |
|---|---|
| Inventaire source Studio/Poste/bibliothèques | Réalisé |
| Inspection du moteur 3D | Réalisée |
| Inspection modèle `ConceptConfig` et store Zod | Réalisée |
| Inspection modèles SQL et workflow | Réalisée |
| Suite Vitest | **26 fichiers / 134 tests réussis** |
| Test E2E Python workflow | **Réussi** |
| Type-check et build frontend | Déjà vérifiés avec succès dans la validation précédente |
| Docker build | **Non testé : Docker non disponible dans le sandbox** |
| Test navigateur multi-onglets | **Non testé** |
| Test visuel automatisé 375/768/1440 px | **Non testé** |
| Solveur physique, CFD ou collision réelle | **Non disponible / non connecté** |

## 3. Architecture réellement présente

```text
React 19 / Vite / TypeScript
│
├─ Home.tsx — cockpit monolithique, état projet et navigation
├─ DesignStudioView — studio SVG paramétrique + export + WebGL/CSS preview
├─ VirtualAssemblyWorkshop — assemblage et bibliothèque locale
├─ DroneSketchProWorkbench — dessin SVG paramétrique
├─ VirtualSimulationCenter — simulation locale et scénarios illustratifs
└─ VirtualFlightTestHall — hall et trajectoires illustratives

Contrats frontend
├─ ConceptConfig / InstalledMaterial / DroneSketch
├─ projectSyncStore Zod v2
├─ droneParts.ts / manufacturerParts.ts
└─ integratedWorkflow.ts

FastAPI / SQLAlchemy
├─ Project, Drone, Simulation, Report, LabSession
├─ PrototypeVersion — configuration immuable
├─ WorkflowRun — scénario/résultat/rejeu
└─ workflow.py — enregistrement, run, replay, rapport
```

### Moteur 3D

Les dépendances `three`, `@react-three/fiber` et `@react-three/drei` sont installées. `PhysicalDroneModel.tsx` utilise réellement React Three Fiber avec `Canvas`, `OrbitControls` et une stratégie de limitation des Canvas WebGL.

Les deux modules audités n’utilisent toutefois pas ce moteur comme source unique de vérité :

- le Studio s’appuie majoritairement sur SVG et sur des composants visuels paramétriques ;
- le Poste utilise une scène CSS/SVG interactive ;
- le modèle WebGL sert surtout à une maquette de compatibilité et non à un modèle CAO structuré.

Il faut donc réutiliser `PhysicalDroneModel` et le contrat de géométrie existant plutôt que créer un second moteur de scène.

## 4. Inventaire fonctionnel

### 4.1 Opérationnel et vérifié

| Fonction | Preuve |
|---|---|
| Ajout de composants conceptuels | `VirtualAssemblyWorkshop.addPart()` modifie `config.installedMaterials` |
| Calcul de masse installée | `installedPartMassKg()` et `installedPartsMassKg()` avec distinction fabricant/concept |
| Sélection et modification de pièces du Studio | `StudioPart`, outils de sélection/déplacement/rotation/échelle |
| Calques, visibilité et verrouillage | `layerVisibility`, `layerLocks`, calques personnalisés |
| Undo/redo local du Studio | snapshots `past` / `future` |
| Dessin paramétrique SVG | composants aile, fuselage, moteur, charge utile, capteur |
| Gradients et symétrie | `DroneSketchProWorkbench` |
| Bibliothèque filtrable | recherche et filtre de catégorie dans `VirtualAssemblyWorkshop` |
| Bibliothèque constructeur structurée | `manufacturerParts.ts`, URLs sources, masse et statut de vérification |
| Export BOM CSV | `buildBillOfMaterialsCsv()` |
| Export concept OpenSCAD | `buildOpenScadModel()` ; explicitement préliminaire |
| Export JSON ingénierie | `buildEngineeringJson()` avec unités SI, hypothèses et limites |
| Snapshot local validé | `projectSyncStore.ts`, Zod v2, migration contrôlée |
| Verrou N2 | `physicalOutputEnabled: false`, tests sécurité frontend/backend |
| Workflow versionné minimal | `PrototypeVersion`, `WorkflowRun`, hash, rejeu, rapport, test E2E |

### 4.2 Partiellement opérationnel

| Fonction | État observé | Écart |
|---|---|---|
| Assistant de création de drone | Configuration par défaut et profil bibliothèque | Pas d’assistant structuré couvrant objectif, énergie, autopilote, contraintes et environnement |
| Architectures | `fixed-wing`, `quadcopter`, `vtol` dans `DroneArchitecture`; plusieurs `modelType` | Pas de règle dédiée complète pour hexacoptère, octocoptère, coaxial, aile volante, personnalisé |
| Géométrie paramétrique | Dimensions et pièces recalculées localement | Pas de graphe de dépendances ni de résolution de contraintes géométriques formelle |
| Sélection 3D | sélection interactive SVG/WebGL/CSS | pas de sélection d’objets Three.js structurés avec identifiants CAO |
| Bibliothèque | concepts + quelques références constructeur | données non homogènes, pas de schéma serveur partagé ni d’import fournisseur vérifié |
| Compatibilité | `compatibleAirframes` présent sur certaines fiches | aucune fonction centrale inspectant tension, courant, puissance, connecteurs, masse, collisions et architecture |
| Connexions | `connectedTo` et bus logiques dans les matériaux | pas d’entités `Connection`, pas de validation de références, pas de persistance dédiée |
| Nomenclature | CSV avec lignes conceptuelles et pièces installées | certaines masses sont explicitement estimées ; pas de nomenclature normalisée serveur ni de total vérifié par source |
| Versions | snapshots locaux et `PrototypeVersion` workflow | le Studio conserve principalement son état en React/local ; restauration serveur complète non démontrée |
| Sauvegarde | `localStorage`, BroadcastChannel et workflow REST | persistance authentifiée du Studio/Poste complète non démontrée par navigateur |
| Passage Studio ↔ Poste | même `ConceptConfig` et `installedMaterials` via props | pas de modèle serveur commun complet pour toutes les entités d’assemblage |
| Passage vers simulation | workflow prototype versionné | le scénario utilise un moteur déterministe de démonstration, sans solveur physique |
| Passage vers Hall | identifiant de run partagé au cockpit | scène du Hall encore illustrative ; elle n’exécute pas le résultat d’un simulateur physique |

### 4.3 Visuel ou simulé uniquement

- Vue éclatée du Poste : déplacement visuel des éléments prédéfinis, sans assemblage mécanique contraint.
- Relations : lignes de relation visuelles, sans graphe de connexions persistant.
- Assistance IA du Poste : conseil heuristique local affiché comme non connecté.
- 3D/maquette : représentation de compatibilité, pas un modèle CAO industriel.
- Temps de vol, charge alaire, poussée/poids et énergie : estimations locales avec hypothèses, non mesures et non validation sécurité.
- Hall d’essais : trajectoires et télémétrie synthétiques ; aucune collision physique calculée.
- Données météo/terrain : scénarios synthétiques locaux.

### 4.4 Absent ou non démontré

- Modèle serveur complet `Project / Architecture / Geometry / Component / ComponentInstance / Subassembly / Connection / Parameter / BOM / Validation`.
- Vérificateur de compatibilité central à quatre états : compatible, incompatible, avertissement, données insuffisantes.
- Graphe persistant de connexions et schéma électrique conceptuel lié aux IDs de composants.
- Assistant multi-étapes de création universelle.
- Validation serveur des configurations et de la géométrie.
- Migration versionnée Alembic.
- Test navigateur couvrant création → construction → sauvegarde → rechargement → simulation → Hall.
- Moteur physique 6-DOF, CFD, collision ou calibrage réel.

## 5. Modèle de données actuel et écarts

### Modèle frontend actuel

`ConceptConfig` centralise :

- géométrie de base ;
- architecture et `modelType` ;
- énergie, masse et charge utile ;
- matériaux installés ;
- couches ;
- croquis ;
- profil de bibliothèque ;
- paramètres de mission et de contrôle.

`InstalledMaterial` fournit déjà une base utile :

- `id`, quantité, masse, catégorie ;
- fabricant, référence, URLs de source ;
- état de vérification ;
- dimensions, interfaces, électricité ;
- offset, échelle, bus logique.

### Modèle backend actuel

Les modèles SQL ajoutés pour le workflow sont utiles mais insuffisants pour le cahier des charges complet :

- `PrototypeVersion` stocke configuration, exigences, croquis et hash dans des colonnes JSON texte ;
- `WorkflowRun` stocke scénario et résultat dans JSON texte ;
- aucune table ne représente une instance de composant, une connexion, un sous-ensemble ou une validation détaillée ;
- aucune contrainte étrangère ne relie les connexions à des composants ;
- `Base.metadata.create_all()` reste utilisé, sans migration versionnée.

### Décision d’architecture proposée

Évoluer le modèle existant, sans créer un second store concurrent :

1. conserver `Project`, `PrototypeVersion`, `WorkflowRun`, `Report` ;
2. ajouter un `DesignDocument` versionné ou étendre `PrototypeVersion` avec un document normalisé ;
3. ajouter `ComponentDefinition`, `ComponentInstance`, `Subassembly`, `Connection`, `ValidationIssue`, `BomLine` ;
4. référencer toutes les instances par identifiant stable ;
5. stocker un snapshot immuable canonique pour chaque version ;
6. ajouter une migration Alembic rétrocompatible ;
7. exposer le même contrat TypeScript/Zod et Pydantic sur le frontend et le backend.

## 6. Architectures réellement prises en charge

| Architecture du cahier des charges | État actuel | Décision |
|---|---|---|
| Quadricoptère | maquette et profil disponibles | support partiel utilisable |
| Hexacoptère | `modelType` possible mais règles dédiées absentes | afficher « modèle conceptuel — règles à compléter » |
| Octocoptère | `modelType` possible mais règles dédiées absentes | ne pas présenter comme validé |
| Voilure fixe | meilleur niveau de prise en charge actuel | support conceptuel principal |
| Aile volante | `modelType` existe | géométrie et règles à compléter |
| VTOL hybride | `airframe: vtol`, profils et maquette | support conceptuel partiel |
| Coaxial | `coaxial-x8` dans `modelType` | non validé par règles d’assemblage |
| Personnalisée | pas de schéma de contraintes | à implémenter comme architecture expérimentale |
| Aile battante / ornithoptère | type présent dans les valeurs métier | aucune règle de construction démontrée |

## 7. Risques classés par priorité

### P0 — à traiter avant de déclarer le système ingénierie opérationnel

1. **Faux positif de compatibilité** : aucun moteur central ne vérifie réellement les interfaces mécaniques et électriques.
2. **Divergence des modèles** : `ConceptConfig` et JSON backend ne couvrent pas les mêmes entités structurées.
3. **Persistance incomplète** : composants, connexions et versions du Studio/Poste ne sont pas démontrés après reconnexion authentifiée.
4. **Confusion CAO/simulation** : la géométrie SVG/CSS/WebGL n’est pas automatiquement un modèle physique ou aérodynamique.

### P1 — haute priorité

1. Ajouter les tables de composant, instance, connexion, validation et BOM.
2. Implémenter le vérificateur de compatibilité à quatre états avec règles traçables.
3. Ajouter un endpoint de sauvegarde/rechargement du document de conception versionné.
4. Remplacer les valeurs conceptuelles de BOM par des lignes explicitement marquées `estimated`, `manufacturer`, `user` ou `missing`.
5. Brancher le Hall sur un résultat de run structuré tout en conservant le marquage `synthetic_demo`.
6. Ajouter un test navigateur du flux complet.

### P2 — qualité et industrialisation

1. Découper `Home.tsx` de 12 994 lignes.
2. Ajouter tests visuels responsive à 375, 768 et 1440 px.
3. Réduire le bundle initial de plus de 2 MB par chargement différé.
4. Ajouter Alembic et tests upgrade/downgrade.
5. Construire réellement l’image Docker en CI.

## 8. Plan d’intégration par étapes

### Phase 1 — terminée par cet audit

- architecture inspectée ;
- composants réutilisables identifiés ;
- capacités classées ;
- limites documentées ;
- aucun composant applicatif modifié.

### Phase 2 — modèle commun

- définir `EngineeringDesignDocument v1` ;
- créer schémas Zod/Pydantic correspondants ;
- ajouter IDs stables et migrations ;
- créer fixtures de quadrirotor, voilure fixe et VTOL clairement marquées conceptuelles.

### Phase 3 — Studio

- brancher le Studio sur le document commun ;
- rendre l’assistant de création explicite ;
- persister les pièces, paramètres, calques et versions ;
- garder SVG/WebGL comme visualisation paramétrique, pas comme CAO industrielle.

### Phase 4 — Poste de construction

- créer instances de composants et sous-ensembles ;
- persister positions, rotations, attaches et visibilité ;
- implémenter la vue éclatée à partir des offsets de données ;
- ajouter suppression confirmée et rechargement.

### Phase 5 — compatibilité, connexions, BOM

- moteur de règles avec quatre états ;
- schéma énergie/commande/données ;
- connexions référencées par IDs ;
- BOM calculée à partir des lignes et sources réellement disponibles ;
- diagnostics avec cause, données manquantes et correction proposée.

### Phase 6 — intégration

- transférer une version immuable au centre de simulation ;
- afficher dans le Hall la version, le run et le niveau de preuve ;
- conserver les résultats synthétiques distincts des résultats physiques ;
- générer le rapport lié au même document et au même run.

### Phase 7 — recette

- tests A à G du cahier des charges ;
- matrice des architectures ;
- tests de permissions ;
- tests de migration ;
- tests responsive ;
- test Docker/CI ;
- audit final des fonctionnalités terminées, partielles et absentes.

## 9. Critères d’acceptation proposés

Une fonction sera déclarée opérationnelle uniquement si :

- elle possède un contrat typé frontend/backend ;
- sa sauvegarde puis son rechargement conservent les IDs et les valeurs ;
- ses erreurs sont vérifiables par test ;
- les données manquantes sont affichées comme telles ;
- la provenance et le niveau de preuve sont visibles ;
- le test correspondant est automatisé ou marqué explicitement « Non testé » ;
- aucun bouton ne déclenche une promesse non implémentée.

## 10. Recommandation de décision

Le projet est prêt pour la **phase 2 — modèle de données commun**. Il ne faut pas ajouter immédiatement davantage de maquettes visuelles. La prochaine modification doit d’abord créer le document d’ingénierie versionné et les entités `ComponentInstance`, `Connection`, `ValidationIssue` et `BomLine`, puis brancher progressivement le Studio et le Poste sur ce document.

Aucune modification applicative n’a été effectuée pendant cette phase d’audit.
