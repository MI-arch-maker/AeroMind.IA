# AeroMind — audit des synchronisations et arborescence atelier

Date : 22 octobre 2026. Audit sur le code du projet joint, sans déploiement distant ni écriture en base de production.

## Verdict

Les synchronisations sont **opérationnelles sur des chemins précis**, mais elles ne sont pas un bus transactionnel unique et tout n’est pas « synchronisé » au sens serveur. Les modifications de cockpit sont enregistrées dans le workspace local et propagées aux autres onglets; les projets authentifiés utilisent la sauvegarde API avec délai anti-rebond. LABBENCH, les reçus de contrôle virtuel, les prototypes versionnés et les documents CAO suivent des stockages/contrats distincts. L’état doit donc être lu par couche : `LOCAL`, `PENDING SYNC`, `SERVER-ACK`, ou preuves/versions qui ne sont pas encore enregistrées.

Un défaut confirmé rendait le diagnostic trop optimiste : `EngineeringSyncHealth` affichait **READY** si aucun avertissement explicite n’était présent, même si l’état des modules incluait `partial` ou `waiting`. Le cas sans run workflow avait un test qui attendait précisément ce statut trompeur. Le calcul a été corrigé : un lien manquant/partiel entraîne désormais **PARTIAL**, et seuls des modules tous liés sans avertissement peuvent être **READY**. Un statut bloqué reste réservé aux erreurs bloquantes.

## Arborescence logique d’atelier

```text
Projet ingénierie
├── Cellule / configuration
│   ├── Configuration & géométrie
│   └── Nomenclature & composants
├── Exigences & conformité
├── Conception & version prototype
│   ├── Studio de conception
│   └── Version immuable enregistrée
└── Vérification & preuves
    ├── Simulation
    ├── Essais virtuels
    ├── Rapports
    └── Audit & traçabilité
```

Cet arbre est maintenant affiché dans le panneau d’état de synchronisation et chaque branche porte son état `LIÉ`, `PARTIEL` ou `EN ATTENTE`; l’état du projet parent ne peut plus être meilleur que ses liens incomplets. Il représente la structure logique et les liens observés, sans prétendre qu’un nœud non persisté est un artefact officiel.

Le backend possède déjà des entités qui se prêtent à cette hiérarchie : `Project`, `PrototypeVersion`, `EngineeringDocumentRecord`, `WorkflowRun`, `Report` et `AuditEvent`. Un prototype garde une configuration SI, des exigences, un croquis et une empreinte; le run référence une version, un scénario et son résultat; un document d’ingénierie est lié à une seule version immuable; rapports et audit sont projet-scopés.

## Ce qui répond effectivement

- **Cockpit / onglets :** le snapshot `ProjectWorkspace` est schématisé/versionné, écrit dans `localStorage`, publié via `BroadcastChannel` et reflété par l’événement `storage`. Les payloads incomplets sont rejetés plutôt que remplacés silencieusement par un workspace vierge. L’ordre d’application inter-onglets utilise `updatedAt`. Des tests couvrent validation, migration d’un ancien snapshot, intégrité des données, données de géométrie et propagation ciblée cockpit → LABBENCH.
- **Projet authentifié :** `projects.saveSnapshot` écrit configuration, exigences, résumé du projet et `runId` dans `Project.data_json` et met à jour la configuration du drone actif. L’API vérifie la propriété du projet. Le cockpit déclare `saved` seulement après la réponse API, `error` en cas d’échec.
- **Audit de validation :** une file d’attente locale distincte est cloisonnée par projet; le client retire les entrées seulement après succès serveur. L’API borne les types d’événements, contrôle le propriétaire et rend l’identifiant d’événement idempotent.
- **LABBENCH :** le registre, l’archivage de simulation et les rapports sont reliés au projet et au propriétaire; un rapport officiel exige un run serveur archivé. Le fallback local reste explicitement local.
- **Versionnement d’ingénierie :** le flux intégré sait enregistrer une version immuable, calculer son hash, lancer/rejouer un scénario et produire le rapport de run. Le document CAO backend refuse une deuxième écriture sur une version immuable et vérifie que son projet et sa version correspondent.
- **Contrôle VIRTUAL :** état par session authentifiée, révision et identifiant d’action protègent des doubles soumissions et des actions obsolètes. Ce canal ne commande pas de matériel.

## Réserves à garder visibles

1. Le flux Workspace est une sauvegarde de snapshot, pas un système de fusion multi-utilisateur. Aucun mécanisme de comparaison-et-échange (`expectedRevision` serveur) n’est visible sur `projects.saveSnapshot`. Si deux onglets/client écrivent presque simultanément, le dernier snapshot accepté peut remplacer le précédent. L’application inter-onglets compare l’horodatage client, ce qui n’équivaut pas à un verrou ou à un ordre atomique serveur.
2. Le workspace cockpit et le workflow immuable sont deux étages distincts : la sauvegarde automatique du cockpit **ne crée pas** à elle seule une `PrototypeVersion`, un `WorkflowRun` ou un document d’ingénierie. Il faut utiliser explicitement le transfert/versionnement du workflow pour créer ces preuves.
3. `Project.data_json` garde un instantané JSON assez large, alors que l’arbre de preuve versionnée réside dans des tables séparées. Certains rapports/audits référencent run et hash dans leurs données JSON plutôt que par clé étrangère directe. C’est cohérent avec une migration progressive, mais il faut conserver les identifiants projet/version/run dans chaque événement.
4. Le canal `BroadcastChannel` et `localStorage` ne synchronise que les onglets du même navigateur/origine; il ne remplace ni la persistance serveur ni la collaboration entre postes.
5. La santé d’ingénierie calcule une complétude de modules à partir des indicateurs passés par l’écran. Un nœud sans preuve positive reste en attente/partiel; ne pas interpréter un badge comme une certification technique ou un essai physique.

## Corrections et validation

Modifications de ce passage : correction du calcul de statut dans `frontend/client/src/lib/engineeringSyncHealth.ts`, arbre de branches dans `EngineeringSyncStatus.tsx` et CSS associé, test de non-régression dans `engineeringSyncHealth.test.ts`. Aucun schéma de base ni contrat de persistance n’a été modifié.

Vérifications attendues : typecheck, suite Vitest, build. Les tests couvrent spécifiquement que l’absence d’un workflow ne peut plus être affichée READY et que l’arborescence se fonde sur une structure à cinq branches.

Résultats exécutés le 22 octobre : 15 tests ciblés passent; suite complète Vitest **262 tests / 53 fichiers réussis**; `tsc --noEmit` réussit; build Vite réussi; catalogues de traduction cohérents; `git diff --check` sans erreur. Le build préserve un avertissement préexistant sur un chunk JavaScript principal volumineux (>500 kB), sans échec de compilation.
