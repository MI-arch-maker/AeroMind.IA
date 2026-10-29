# Livraison — Correction du chargement et de la synchronisation AeroMind

**Date :** 28 octobre 2026  
**Périmètre :** workspace AeroMind et LabBench intégré transmis en archive  
**Type de livraison :** sources corrigées; aucun déploiement n’a été effectué.

## Résumé

Le chargement d’une cellule au login provenait de deux comportements couplés : la sélection automatique d’un premier projet côté Home/LabBench et la reprise immédiate de données de cellule conservées dans le workspace. Une cellule restaurée était ainsi traitée comme active sans geste d’intégration de l’utilisateur.

La règle est désormais explicite : une cellule restaurée reste dormante. Dans l’interface intégrée, LabBench n’accepte et ne présente la cellule qu’après une sélection de la bibliothèque ou un dessin géométrique dans le studio, pendant la session courante.

## Changements réalisés

### 1. Plus de cellule/projet activé par défaut

- Retrait de la sélection automatique du premier projet disponible au chargement de Home et de LabBench.
- Retrait de l’abonnement/autochargement indépendant du drone actif dans LabBench.
- Une cellule persistée ne suffit plus à ouvrir LabBench : l’état de sélection de cette session est requis.
- Le profil et le libellé de cellule restaurés sont masqués dans le cockpit jusqu’à une nouvelle action explicite.
- Les requêtes LabBench par projet (registre, gate, audit et données associées) n’ont pas d’identifiant de projet exploitable avant l’intégration.
- Le signal d’intégration est émis uniquement par une sélection de cellule/catalogue ou par une géométrie de drone dessinée; les annotations seules ne déverrouillent pas LabBench.
- Le verrou de session est remis à zéro lors d’un changement de projet ou de compte.

### 2. Synchronisation plus robuste

- Les sauvegardes de workspace sont mises en file séquentielle afin qu’une réponse lente d’une ancienne sauvegarde ne puisse écraser un snapshot plus récent.
- L’état « enregistré » n’est affiché qu’après l’acquittement de la dernière génération de sauvegarde.
- L’hydratation anonyme en cours est annulée au changement d’authentification pour éviter qu’une réponse tardive remplace un workspace connecté.
- Le changement de compte vide l’état de l’ancien compte et force une nouvelle récupération avant réhydratation.
- Le premier projet serveur n’est plus choisi implicitement au login.
- Le cache local serveur des workspaces anonymes ne prime plus sur la base : les GET relisent la base canonique à chaque fois, le cache ne servant qu’en cas d’indisponibilité DB. Cela évite qu’un worker serve durablement une valeur périmée après une écriture depuis un autre worker.
- La reconnexion WebSocket est annulable et utilise un backoff exponentiel jusqu’à 30 secondes; le délai n’est remis à zéro qu’après 30 secondes de connexion stable. Un heartbeat toutes les 15 secondes reconnaît le `pong` du serveur et déclenche une reconnexion si le heartbeat expire.

## Vérifications exécutées

| Contrôle | Résultat |
|---|---:|
| Vitest frontend complet | **56 fichiers, 281 tests réussis** |
| TypeScript `tsc --noEmit` | **Réussi** |
| Build frontend `pnpm build` | **Réussi** |
| Persistance workspace backend | **9 tests réussis** |
| Compilation Python (`py_compile`) | **Réussie** |
| Pytest backend complet | **239 réussis, 13 ignorés, 4 indisponibles** |

Les quatre tests backend restants sont des tests de migration qui démarrent un vrai PostgreSQL. Ils n’ont pas pu s’exécuter dans cet environnement : le module de test `pgserver` et les binaires PostgreSQL ne sont pas présents. Le build signale également des chunks JavaScript supérieurs à 1,5 Mo; le build réussit, mais ce point de découpage de bundle est à traiter séparément.

## Réserve de sécurité bloquante — hors périmètre de cette correction

La revue statique a relevé un défaut important dans `web/labbench_canonical_api.py`, route `/sessions/step-up` : le serveur vérifie que `mfa_code` est composé de six chiffres, mais ne vérifie pas le code contre le TOTP inscrit; en outre, les rôles sont acceptés depuis `payload.roles` après validation de leur nom et transmis à la session Step-up. Ce flux doit être corrigé avant toute exposition en production : validation TOTP serveur et calcul des rôles à partir des droits réellement accordés à l’utilisateur. **Cette livraison ne modifie pas ce mécanisme d’authentification; ne pas considérer cette réserve comme résolue.**

## Déploiement

Aucune migration de schéma n’est requise pour ce correctif. Intégrer les fichiers source de l’archive corrigée, lancer les contrôles de la CI cible, puis déployer selon le pipeline AeroMind habituel. Après déploiement, vérifier le parcours suivant : connexion super-admin → aucun drone sélectionné → LabBench verrouillé et aucune donnée de cellule chargée → sélection bibliothèque ou dessin géométrique → cellule disponible dans LabBench.
