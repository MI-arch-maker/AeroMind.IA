# AeroMind — correction des projets implicites et des assets Render

**Date :** 30 octobre 2026  
**Périmètre :** restauration/sauvegarde des projets, cache navigateur, service worker et service des fichiers frontend.

## 1. Projet par défaut restauré sans action

Le chemin GET du workspace anonyme pouvait réhydrater des snapshots anciens contenant des identifiants historiques générés automatiquement (`project-local-1` et `project-aeromind-inspection-demo`). Ces identifiants étaient déjà filtrés dans d’autres chemins de restauration, mais pas dans l’hydratation depuis `/api/local/workspace`. Cela pouvait faire réapparaître un ancien projet local; l’autosauvegarde pouvait ensuite recopier ce snapshot.

La restauration serveur ignore désormais seulement ces deux identifiants réservés, sans supprimer le workspace ni effacer de données. L’autosauvegarde ne peut mettre à jour qu’un projet déjà présent dans la liste; elle ne peut plus transformer un identifiant actif périmé en nouveau projet. La création canonique demeure dans le parcours explicite de création et de confirmation. Les endpoints GET/PUT de workspace enregistrent un brouillon de workspace, pas une entité `Project` canonique; un test vérifie que leur consultation/restauration/synchronisation ne crée aucun projet.

## 2. Interface blanche / fichiers 404 après Render

Le journal fourni montre que la page sollicitait simultanément des fichiers hashés de deux builds différents : les anciens `vendor-ui-0bJkXbnY.js`, `vendor-markdown-DGgcj4fJ.js`, `index-CpI0r2Ek.css` et `index-C_hPTgtu.js` répondaient 404, tandis que d’autres chunks et des hashes plus récents répondaient 200. L’ancien service worker appliquait une stratégie cache-first à la navigation et à `/assets/`; un `index.html` conservé en cache pouvait donc référencer des chunks disparus après la publication d’un nouveau build. Le fallback SPA pouvait également renvoyer l’HTML pour une URL d’asset manquant.

Les pages HTML et `/sw.js` sont maintenant servis avec des directives de revalidation sans cache persistant; les ressources Vite fingerprintées existantes restent immuables un an. Un asset statique manquant reçoit un vrai 404, jamais le document SPA. Le nouveau service worker purge les anciens caches AeroMind et se désenregistre sans intercepter de requêtes. Le frontend met à jour une registration historique existante mais n’en crée pas une nouvelle à chaque chargement.

## Vérifications

- Frontend : catalogues synchronisés (**2 617 clés**), contrôle TypeScript réussi, **65 fichiers de tests / 318 tests réussis**, build de production réussi.
- Backend : syntaxe Python validée; **38 tests réussis, 1 ignoré** sur les contrôles cache/worker, non-création de projet, persistance workspace, GPS WGS84, workflow et régressions.
- Le build affiche un avertissement Vite non bloquant sur les gros chunks JavaScript; la génération de production aboutit. Les logs Render fournis ne sont pas un test de navigateur et aucun déploiement distant n’a été déclenché depuis cette session.

## Mise en service

Le manifeste Render du projet garde `autoDeploy: false`. Les corrections sont dans le paquet livrable, mais elles n’affecteront le domaine Render qu’après publication de cette version. Après le déploiement, effectuer un rechargement de la page. La nouvelle réponse `/sw.js` retire le cache-first historique; si un onglet déjà ouvert reste contrôlé par l’ancienne version, fermer l’onglet et le rouvrir, ou faire un rechargement forcé une fois.
