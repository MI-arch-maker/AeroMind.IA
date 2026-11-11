

## Reprise — rendu mécanique et supervision L1–L3 des consoles (11 novembre 2026)

### Portée et approche

Poursuivre les consoles existantes sans refonte ni remplacement. Remplacer dans Admin le modèle catalogue indépendant par une vue mécanique/paramétrique issue uniquement d’un projet explicitement sélectionné et de sa configuration réellement persistée. Ajouter un accès équivalent au Super-Admin sans charger les configurations de tous les projets en bloc. Ajouter une supervision des événements L1–L3 filtrable par niveau, basée sur les journaux présents et leur propriétaire effectif. Garder l’isolation personnelle L1–L3, l’accès gouvernance L4–L5, l’absence de connexion automatique, l’absence de création de cellule/drone, la facturation désactivée et toutes les sorties physiques verrouillées.

Le frontend conserve `AdminConsole.tsx` et `SuperAdmin.tsx`, leurs coques, styles, navigation, commandes et flux d’authentification. Les aperçus réutilisent `DroneCatalogDesign` + `ConceptConfig` → `buildMechanicalModel` (`frontend/client/src/lib/mechanicalTwinGeometry.ts`) → `MechanicalTwinViewport`. Ils n’utilisent pas `PhysicalDroneModel` comme substitut. Sans sélection, configuration exploitable ou architecture résoluble, le canvas reste vide et explique la condition manquante; aucune configuration catalogue par défaut, cellule, projet ou sauvegarde n’est créée.

Pour Admin L4, l’API conserve l’authentification par cookie Admin et ne résout la configuration que dans le workspace propriétaire. Pour Super-Admin L5, une requête explicite et protégée résout un seul projet choisi. Les réponses sont minimisées aux champs nécessaires au rendu, sans chargement global de payloads. La supervision lit les journaux persistés `AuditEvent` owner-scoped et `AuditEventExt` append-only, rattache l’acteur au registre d’identité serveur et calcule le niveau avec `effective_level`; le filtre ne fait pas confiance à un niveau déclaré par le client. Admin reçoit des métadonnées d’audit, pas les payloads personnels d’autres comptes. Le rafraîchissement périodique est décrit comme quasi temps réel, non comme un flux continu.

### Structure existante réutilisée

- `web/` : FastAPI, sessions dédiées, contrôles Admin/Super-Admin, agrégation d’audit et SQLAlchemy; `web/app.py` contient la compatibilité tRPC existante.
- `frontend/client/src/pages/` : composition des consoles institutionnelles.
- `frontend/client/src/components/` : `MechanicalTwinViewport` et éventuel panneau réutilisable en lecture seule.
- `frontend/client/src/lib/` : catalogue, `ConceptConfig`, construction géométrique et traductions FR/EN.
- `tests/` et tests Vitest adjacents : couverture des gardes, de l’isolation propriétaire, de la résolution des niveaux, de l’absence de génération automatique et des états vides.

G01–G05 restent informatifs. Aucune politique, gate matériel, session Step-up, commande physique ou transport n’est modifié. La parité française/anglaise suit i18next. « Temps réel » désigne l’interrogation périodique des journaux disponibles; les actions non enregistrées dans les tables existantes ne peuvent pas être présentées rétroactivement comme événements observés.

Aucune publication, connexion à une infrastructure persistante, modification de secret, émission de commande matérielle ou certification n’est comprise dans cette reprise.
