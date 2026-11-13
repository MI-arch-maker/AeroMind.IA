# Plan d’implémentation — AeroMind IA modernisé

## Objectif

Appliquer au projet importé le cahier des charges « Intégration du rendu technique Blueprint / X-Ray » sans casser le cockpit existant, les centres métier ni les garde-fous G01–G05. La Preview et la simulation restent strictement virtuelles : `HARDWARE_CONTROL=false`, `AEROMIND_VIRTUAL_ONLY=true`, `physicalOutputEnabled=false`.

## Approche d’implémentation

- Réutiliser React/Vite, FastAPI, Three.js, les modèles OBJ/STL/SCAD et les composants mécaniques déjà présents.
- Faire du modèle mécanique sélectionné la source unique du viewport : `droneId`, `modelId`, version, paramètres, composants et provenance sont conservés dans le contrat de rendu.
- Centraliser les presets, caméras, couches, sélection, éclatement, annotations et fallback dans le pipeline partagé utilisé par les centres de conception, CAD, simulation, maintenance, qualité, production et Super-Admin.
- Afficher explicitement les états « drone non sélectionné », « modèle indisponible », « géométrie partielle », « composants internes absents », « WebGL indisponible », « erreur de chargement », « données incomplètes », « désynchronisé » et « rendu limité ».
- Garder les interactions visuelles séparées de toute mutation persistante ou commande matérielle. Les actions de modification restent contrôlées par les droits et la chaîne G01–G05.
- Préserver le niveau de détail et la fluidité par réutilisation du mesh, matériaux, cache local de scène, chargement progressif et fallback vectoriel clairement étiqueté.

## Contrat de données de rendu

Le pipeline reçoit : `droneId`, `modelId`, `modelVersion`, `mechanicalModel`, `activeParameters`, `preset`, `camera`, `layerVisibility`, `explosionLevel`, `selectedComponent`, `centreContext`, `source`, `syncStatus` et `renderCapabilities`. Chaque composant rendu expose un identifiant stable, une catégorie, un nom, une géométrie éventuelle, des dimensions, un état de validation et une provenance catalogue/CAD/jumeau mécanique.

## Structure du projet

- `frontend/client/src/components/MechanicalTwinViewport.tsx` : scène 3D, presets, caméra, sélection et couches.
- `frontend/client/src/lib/aircraftRenderSchema.ts` : contrat normalisé du modèle et des états de rendu.
- `frontend/client/src/lib/renderEngines.ts` : registre des moteurs/presets et capacités/fallbacks.
- `frontend/client/src/lib/mechanicalTwinGeometry.ts` : géométrie issue du modèle sélectionné.
- `frontend/client/src/components/MechanicalTwinIntegrationDock.tsx` et `MechanicalWorkbench.tsx` : intégration dans les centres.
- `frontend/client/src/pages/Home.tsx` et les centres métier : transmission du drone réellement sélectionné et du contexte.
- `web/` : FastAPI, modes virtuels, audits et API existantes ; aucune route visuelle ne doit contourner les garde-fous.
- `frontend/client/public/manus-routes.json` : routes déclarées pour la Preview.
- `Dockerfile`, `frontend/package.json`, `requirements.txt` : build et runtime port 3000.

## Direction design

- **Mouvement** : salle de contrôle aéronautique contemporaine, inspirée des interfaces de télémétrie et des consoles CAO industrielles.
- **Principes** : densité utile, hiérarchie lisible, provenance visible, statut toujours explicite.
- **Palette** : graphite et bleu pétrole pour réduire la fatigue visuelle ; teal AeroMind `#44C8D2` comme signal de sélection, de synchronisation et de réussite ; ambre/rouge réservés aux alertes.
- **Mise en page** : poste de travail à rail latéral, canvas technique central et inspecteur contextuel ; panneaux escamotables pour préserver la zone 3D.
- **Signatures** : grille blueprint discrète, lignes cyan de construction, badges de version/provenance et barre d’état simulation-only.
- **Interaction** : chaque action visuelle est réversible, locale par défaut et accompagnée d’un état explicite ; aucune interaction de scène ne déclenche une commande matérielle.
- **Animation** : transitions courtes et fonctionnelles, chargement progressif non bloquant, pas d’animation décorative qui gêne l’inspection.
- **Typographie** : Inter pour l’interface, IBM Plex Mono pour les identifiants, dimensions, versions et journaux.
- **Essence de marque** : un poste d’ingénierie drone traçable qui relie la cellule sélectionnée à sa géométrie inspectable. Précise, sobre, auditable.
- **Voix** : « Cellule synchronisée — inspection prête. » ; « Rendu virtuel uniquement — aucune commande matérielle. »
- **Logotype** : conserver le logo AeroMind fourni et l’utiliser avec le libellé de centre plutôt qu’un wordmark généré.

## Build et livraison

Installer les dépendances avec le lockfile existant, exécuter les checks ciblés backend/frontend, construire `frontend/dist/index.html`, démarrer FastAPI sur le port Webdev 3000, vérifier `/api/ready` et `/manus-routes.json`, enregistrer un checkpoint propre, puis produire `Aeromind.IA-modernise.zip` sans `node_modules`, caches, `.env` réel ou artefacts temporaires.
