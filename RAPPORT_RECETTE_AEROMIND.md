# Rapport de recette — AeroMind v2.1

**Date :** 13 octobre 2026  
**Périmètre :** synchronisation Poste de Construction → Studio de Conception → vue principale AeroMind.

## Phase 0 — Diagnostic

Le rapport détaillé est disponible dans [RAPPORT_DIAGNOSTIC_AEROMIND_V2_1.md](./RAPPORT_DIAGNOSTIC_AEROMIND_V2_1.md).

Ruptures confirmées avant correction :

- `Home` portait plusieurs états projet sans enveloppe versionnée ni validation runtime ;
- le Studio possédait un état local `parts` plus riche que la projection `ConceptConfig` ;
- `readPersistedState()` transformait toute corruption en état vierge silencieux ;
- `/api/local/workspace` n’existait pas et pouvait tomber sur le shell frontend ;
- les messages BroadcastChannel n’avaient ni horodatage, ni source, ni statut, ni résolution de conflit ;
- les erreurs de `localStorage` et d’API étaient parfois présentées comme un succès.

## Phase 1/2/3 — Corrections implémentées

- [✓] **DIAG-01 à DIAG-04** — Diagnostic produit avant les modifications.
- [✓] **STORE-01** — Les mutations de workspace passent par une enveloppe projet centralisée utilisée par Home et tous les éditeurs via `config`/`setConfig`.
- [✓] **STORE-02** — Ajout de `projectSyncStore.ts` avec schéma Zod versionné (`schemaVersion: 2`) couvrant configuration matérielle, architecture, mission, paramètres de simulation, profils, projets et exigences.
- [✓] **STORE-03** — Les snapshots éditeur sont validés avant d’être persistés ou diffusés.
- [✓] **STORE-04** — Migration contrôlée des snapshots legacy sans retour automatique à un état vierge.
- [✓] **STORE-05** — `physicalOutputEnabled` est imposé à `false` dans toute nouvelle enveloppe.
- [✓] **SYNC-01** — Les modules existants continuent de partager immédiatement `config` dans Home ; chaque mutation déclenche un snapshot centralisé.
- [✓] **SYNC-02** — BroadcastChannel reçoit désormais des snapshots versionnés et validés.
- [✓] **SYNC-03** — La restauration au démarrage lit et valide la clé persistée versionnée.
- [✓] **SYNC-04** — Chaque snapshot contient `updatedAt`, `source` (`LOCAL`/`SERVER-ACK`) et `syncStatus`.
- [✓] **SYNC-05** — Données incompatibles et erreurs de stockage/API passent en erreur visible, sans succès de façade.
- [✓] **PERSIST-05** — Une corruption JSON ou schéma est rejetée explicitement ; les données valides ne sont pas remplacées silencieusement par le workspace vierge.
- [✓] **PERSIST-06** — Hydratation depuis `localStorage` avant le premier rendu de Home via `useMemo(readPersistedState, [])`.
- [✓] **PERSIST-07** — Les snapshots locaux restent marqués `LOCAL` jusqu’à l’accusé serveur ; la sauvegarde distante en échec est marquée erreur.
- [✓] **STATUS-01** — Le header affiche `SYNCHRONISÉ (LOCAL)`, `SYNCHRONISÉ (SERVEUR)`, `SYNCHRONISATION…` ou `ERREUR DE SYNCHRONISATION`.
- [✓] **STATUS-02** — Les snapshots inter-onglets plus anciens sont ignorés et déclenchent l’avertissement « Données remplacées par une modification plus récente ».
- [✓] **API local workspace** — Ajout de `GET/PUT /api/local/workspace` avec réponses JSON et rejet de `physicalOutputEnabled != false`.

## Tests exécutés

| Test | Résultat |
| --- | --- |
| `pnpm run check` | **PASS** |
| `pnpm test -- --run` | **PASS — 24 fichiers, 128 tests** |
| Tests du nouveau store | **PASS — validation, migration, corruption, garde-fou physique** |
| `pnpm run build` | **PASS** |
| `python3 -m py_compile web/*.py` | **PASS** |
| Tests négatifs `arm`, `actuator-write`, `mission-upload` | **PASS dans la suite existante** |
| E2E Playwright T1–T8, deux onglets et 10 restaurations F5 | **NON EXÉCUTÉS dans ce sandbox** |
| OIDC réel et CRUD BDD | **NON EXÉCUTÉS : secrets/dépendances d’intégration absents** |

## Garde-fous conservés

- N2 reste le seul niveau actif ; N3/N4 ne sont pas activables par synchronisation.
- Toute configuration propagée conserve `physicalOutputEnabled: false`.
- Le Poste de Construction reste documentaire et ne signifie pas matériel connecté.
- `arm`, `actuator-write` et `mission-upload` restent rejetés.
- Une donnée locale reste badgée `LOCAL` tant qu’aucun accusé serveur réel n’est reçu.

## Conclusion

La synchronisation est désormais versionnée, validée, persistée avec statut explicite et propagée par snapshot horodaté. La propagation inter-modules dans le montage Home est couverte par le store commun existant et les tests de validation ; la couverture E2E multi-page/multi-onglet/F5 doit encore être ajoutée et exécutée dans la CI d’intégration pour déclarer les huit scénarios de recette totalement certifiés.
