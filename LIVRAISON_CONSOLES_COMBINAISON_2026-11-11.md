# Addendum de livraison — consoles AeroMind.IA

**Date : 11 novembre 2026**  
**Périmètre :** combinaison des trois concepts d’interface approuvée par le client, sans suppression des consoles existantes ni refonte du backend.

## Changements livrés

### Console Administrateur — workspace L4

- Le contexte de gouvernance affiche le rôle effectif (L4 Admin ou L5 Super-Admin) et l’état de sortie physique fourni par l’API de console.
- Les raccourcis ouvrent la route existante `/virtual-factory`; l’ouverture de cette page ne crée ni projet ni cellule et ne lance aucune simulation.
- Le registre projets permet désormais d’inspecter une ligne par souris ou clavier. Le panneau expose exclusivement les métadonnées déjà renvoyées par l’endpoint workspace : identifiant, cellule référencée et dates. La fermeture du panneau est fonctionnelle; aucune donnée globale ou configuration d’ingénierie n’est ajoutée.
- L’export CSV couvre les projets, simulations et événements d’audit du workspace autorisé. Chaque cellule est citée, les guillemets sont échappés et les valeurs susceptibles d’être interprétées comme formules sont neutralisées.
- Les actions existantes Connexion, Déconnexion, Mise en veille et validation explicite du gateway LLM sont conservées.
- La déconnexion Super-Admin vérifie maintenant la réponse HTTP de révocation; si le serveur échoue, l’interface conserve son état connecté et signale l’échec au lieu d’annoncer une session fermée.

### Console Super-Administrateur — plan de contrôle L5

- L’onglet Opérations réunit une frise G01–G05 dans le langage visuel institutionnel AeroMind, avec accès à la matrice L1–L5, à l’ingénierie virtuelle et au cockpit de simulation existants.
- Le raccourci G01–G05 mène à `/?view=mission-center`. Le module actuellement accessible dans le cockpit est une **simulation locale** : la frise n’affiche aucun statut de demande en temps réel et ne prétend pas qu’une décision a été enregistrée dans le journal serveur.
- La frise précise que GATE 05 n’autorise pas une sortie matérielle. Les commandes de mode, la supervision, l’inventaire des capacités et les outils de gouvernance existants restent en place.

### Cloisonnement et limites de la tranche

Aucune route backend, règle L1–L5, session, migration ou permission n’a été modifiée dans cette tranche. En particulier, l’API FastAPI `/api/institutional` n’est pas raccordée à la frise : ses opérations exigent une `StepUpSession` liée à un projet, et aucune session Admin/Super-Admin ne contourne cette exigence. Aucune file globale de demandes G01–G05, décision live, commande matérielle, connexion automatique, création de cellule ou action de facturation n’a été ajoutée.

## Vérifications

- Backend : **331 tests réussis, 14 ignorés**, avec 3 avertissements non bloquants.
- Frontend : `pnpm check` réussi (catalogues et TypeScript), **79 fichiers de tests / 378 tests réussis**, puis `pnpm build` réussi.
- Le build conserve un avertissement non bloquant : certains bundles minifiés dépassent 1,5 Mo.
- Après le correctif de déconnexion : `pnpm check`, les tests Vitest (79 fichiers / 378 tests) et `pnpm build` ont tous réussi. Ces contrôles valident la compilation et les tests existants, pas un parcours navigateur authentifié de cette commande.
- `pnpm i18n:lint` reste en échec en raison d’un volume antérieur de libellés JSX codés en dur dans plusieurs vues, notamment des libellés Admin inchangés. Les nouveaux libellés de cette tranche ont été ajoutés aux catalogues FR/EN; le contrôle ciblé ne relève plus d’omission pour ces nouveaux textes.

## Non effectué

Aucun déploiement Render ou autre déploiement de production n’a été lancé. La connectivité réelle au gateway LLM n’a pas été retestée dans cette tranche. Aucun essai E2E navigateur authentifié des workflows de décision ou de révocation n’a été exécuté. La livraison vérifie la compilation, les tests existants et les contrôles backend; elle ne constitue pas une garantie absolue de fonctionnement parfait de chaque commande préexistante de toute la plateforme.
