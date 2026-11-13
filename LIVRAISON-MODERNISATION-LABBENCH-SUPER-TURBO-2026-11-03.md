# Livraison — Modernisation profonde LABBENCH

## Changements

- Extraction de l’architecture déclarative LABBENCH dans `frontend/client/src/lib/labBenchArchitecture.ts` : types de contrat, cinq zones, modes, gates N1→N4, progression par zone et état local initial.
- `LabBench.tsx` conserve le rendu, les appels tRPC, l’authentification Step-up, la synchronisation projet/drone et les garde-fous ; il consomme désormais un module pur et testable au lieu de porter ces déclarations.
- Ajout de tests de contrat pour vérifier la séquence des gates, les cinq zones, le verrouillage des étapes ultérieures et le caractère logiciel des modes.
- Renforcement visuel local du shell LABBENCH : tokens de surface, profondeur des panneaux, hiérarchie active, focus clavier visible, responsive mobile et respect de `prefers-reduced-motion`.
- Suppression des deux libellés demandés dans l’interface rendue : `LabBench 01 — interface intégrée à AeroMind` et `VIRTUAL ONLY — aucune liaison matérielle`. Les indications de sécurité et de simulation restent exprimées par des libellés exacts non ambigus.

## Préservation

Aucun endpoint backend, contrat tRPC, migration, stockage, règle d’authentification, gate de sécurité, synchronisation AeroMind ou sortie matérielle n’a été modifié.

## Validation

- `pnpm run check` : OK — catalogues synchronisés, 2 617 clés, TypeScript OK.
- `pnpm test` : OK — 79 fichiers, 377 tests.
- `pnpm run build` : OK — bundle Vite généré. Les avertissements existants concernent la taille de chunks et le script `/api/platform/config.js` non-module.
- Vérification des deux libellés exacts : absents du frontend rendu.
- Tests backend LABBENCH non exécutés dans cet environnement : le module Python `pytest` n’est pas installé ; les fichiers backend sont restés inchangés.

## Correctif prévisualisation — Invalid host header

La cause était une allowlist limitée à `*.us5.manus.computer` alors que cette session utilise un relais `*.us3.manus.computer`. L’allowlist par défaut et `.env.example` acceptent maintenant `*.manus.computer`, toujours via `TrustedHostMiddleware`; les hôtes arbitraires ne sont pas ouverts.

Vérification effectuée avec les Host suivants : `us3.manus.computer`, `us5.manus.computer` et `localhost`, tous en HTTP 200 sur `/api/ready`. L’URL publique de prévisualisation répond également HTTP 200.

## Audit MISSION PLANNER — exécution complète

Le Mission Planner a été inspecté sur toute sa chaîne écran → API → sécurité MAVLink. Les boutons de création, actualisation, sélection, retour à la liste, suppression de waypoint, suppression de mission, sauvegarde et upload sont désormais explicitement câblés et accessibles au clavier.

Les brouillons avec coordonnées absentes sont maintenant normalisés et affichés sans exception JavaScript : la carte ignore les points non localisés, tandis que la liste conserve leur état éditable. L’écran ne tente jamais d’inventer une coordonnée. L’upload reste désactivé sans projet, puis demeure soumis aux contrôles backend matériel, jeton, géofence, idempotence et ACK MAVLink.

Un défaut backend a également été corrigé dans le chemin d’échec du protocole : l’exception `HardwareCommandError` est maintenant référencée via le module réellement importé, ce qui garantit que les échecs de transport sont persistés en `failed` et retournés proprement au lieu de produire une seconde erreur `NameError`.

Validation finale : 378 tests frontend réussis, 20 tests backend ciblés Mission Planner/MAVLink réussis, typecheck OK et build Vite OK. Les seuls avertissements de build sont les avertissements préexistants de taille de chunks et de script de configuration non-module.
