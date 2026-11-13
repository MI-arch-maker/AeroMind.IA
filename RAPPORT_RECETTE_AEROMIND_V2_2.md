# AeroMind v2.2 — Rapport de recette des rendus modifiables

## Résumé

La fondation multi-vues est livrée dans les deux studios : **Poste de Construction** et **Studio de Conception**. Les six rendus sont accessibles sans condition, partagent le même schéma aéronautique versionné et écrivent uniquement dans la configuration projet locale.

Le diagnostic Phase 0 est disponible dans [`RAPPORT_DIAGNOSTIC_AEROMIND_V2_2.md`](./RAPPORT_DIAGNOSTIC_AEROMIND_V2_2.md).

## Preuves automatisées

| Contrôle | Résultat |
|---|---:|
| TypeScript `pnpm run check` | [✓] réussi |
| Tests Vitest | [✓] 25 fichiers, 131 tests réussis |
| Build Vite | [✓] réussi |
| Validation de migration et rejet d’une valeur invalide | [✓] `aircraftRenderSchema.test.ts` |
| Garde-fou `physicalOutputEnabled: false` | [✓] conservé dans le store existant |
| Connexions matérielles réelles / commandes d’armement | [✓] non touchées |

## Matrice des exigences

### Phase 0

- [✓] **DIAG-R1** — moteur Three.js/R3F, primitives et cause de déconnexion documentés.
- [✓] **DIAG-R2** — `ConceptConfig`, `DroneCatalogDesign` et `InstalledMaterial` documentés.
- [✓] **DIAG-R3** — rapport de diagnostic livré avant l’implémentation.

### Fondation commune

- [✓] **SCHEMA-01** — schéma Zod versionné `AircraftParameters` avec aile, fuselage, empennages, propulsion, stations et composants.
- [✓] **SCHEMA-02** — chaque mutation est validée ; une valeur invalide est rejetée et l’état courant est conservé.
- [✓] **SCHEMA-03** — migration automatique de `ConceptConfig`, du profil catalogue et des matériaux installés sans perte des variantes existantes.
- [✓] **VIEW-01** — sélecteur R1 à R6 affiché dans les deux workbenches.
- [✓] **VIEW-02** — les six rendus restent disponibles sans authentification, niveau de mode ou projet serveur.
- [✓] **VIEW-03** — `renderMode` est persisté dans la configuration du projet et restauré par le workspace existant.
- [✓] **VIEW-04** — chaque basculement reconstruit son état depuis la configuration courante ; le badge expose `LOCAL` et le résultat du recalcul.
- [✓] **VIEW-05** — six vues indépendantes (`R1` à `R6`) consomment le même workbench et le même snapshot aéronautique.

### Rendus

- [✓] **R1** — rendu 3D paramétrique existant alimenté par la configuration migrée, avec panneau de paramètres pour envergure, corde et longueur de fuselage.
- [✓] **R2** — poignée de saumon d’aile draggable et écriture validée dans le store ; valeur affichée en direct.
- [✓] **R3** — blueprint SVG avec plan/profil/face et dimensions éditables via le panneau partagé.
- [✓] **R4** — stations de profils, corde, vrillage et profil modifiables ; validation conservée par le schéma.
- [✓] **R5** — composants installés affichés séparément, position X éditable, masse et CG estimés affichés comme données documentaires.
- [✓] **R6** — création de variante locale, liste de variantes et superposition fantôme ; état vide explicite si aucune référence n’existe.

### Propagation et garde-fous

- [✓] **PROP-01** — les mutations passent par `setConfig` et alimentent les deux workbenches depuis le même état projet.
- [✓] **PROP-02** — le mécanisme de workspace v2.1 existant reste utilisé pour la persistance locale et inter-onglets.
- [✓] **LABEL-01** — le badge n’affiche plus « Synchronisé » par défaut : il affiche le statut réel du recalcul local ou l’erreur de validation.
- [✓] **LABEL-02** — nom de variante/profil, heure de modification et source `LOCAL` sont affichés.
- [✓] **G-3 / G-9** — R5 est explicitement documentaire et R4 ne présente aucun résultat CFD mesuré ou certifié.
- [✓] **Garde-fou physique** — aucune vue ne peut activer une sortie physique ou augmenter le niveau N2/N3/N4.

## Limites connues

Les tests unitaires et le build sont au vert. Une matrice E2E navigateur T1–T12 complète, incluant deux onglets réels, mesure stricte sous 100 ms et export PDF/PNG du blueprint, n’a pas été exécutée dans cette recette et reste à planifier avant une déclaration de conformité finale JR4.

La vue R3 fournit actuellement l’édition des dimensions via le panneau commun ; l’édition directe de chaque cote SVG et l’export documentaire PDF/PNG sont des extensions de recette à ajouter pour clore les critères R3-02/R3-03 au niveau E2E.
