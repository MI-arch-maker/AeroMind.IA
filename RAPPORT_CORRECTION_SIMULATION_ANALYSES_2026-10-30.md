# AeroMind — correction de l’écran Simulation & analyses

**Date :** 30 octobre 2026

## Constat

L’écran Simulation & analyses pouvait devenir noir après navigation lorsque le navigateur conservait un ancien service worker et un ancien `index.html` faisant référence à des chunks Vite supprimés ou provenant d’un autre build. La reproduction interactive avec le build courant affiche correctement l’écran et ne produit aucune erreur console au clic sur l’onglet.

## Correctifs appliqués

- `frontend/client/src/main.tsx` : la retraite des anciens service workers ne se limite plus à `registration.update()`. Au chargement de la version de production, les enregistrements sont désenregistrés et les caches AeroMind historiques sont supprimés directement.
- `frontend/vite.config.ts` : l’hôte de preview cloud est explicitement autorisé afin que la recette interactive ne soit pas remplacée par la page Vite « host not allowed ».
- `frontend/client/src/components/PhotorealisticTerrain3D.tsx` : ajout d’une boundary locale autour de React Three Fiber et d’un rendu 2D de secours lorsque `THREE.WebGLRenderer` ne peut pas créer de contexte. L’échec graphique ne peut plus faire tomber toute la vue Simulation.
- `frontend/client/src/components/aero-test-field-station.css` : styles du terrain de compatibilité 2D, conservant l’environnement, la grille et l’information opérationnelle.
- `frontend/client/src/components/AeroTestFieldStation.tsx` : le sélecteur du **Terrain d’essais · vol simulé** est limité à Forêt, Zone urbaine, Terre plate et Montagne. Brousse, Neige, Temps chaud et Mer ne sont plus proposés.
- Le terrain d’essais utilise maintenant `OpenStreetMapView` en mode **satellite** avec ESRI World Imagery, quatre zones réelles de référence (Forêt de Fontainebleau, Paris, plaine française, Alpes) et une animation légère de dérive/scan. Les couches de trajectoire, waypoints et interactions locales restent au-dessus de l’imagerie.
- Le comportement fonctionnel de `VirtualSimulationCenter` et de `OpenStreetMapView` a été contrôlé sur workspace vierge : l’écran se monte, les deux cartes s’affichent, les commandes restent accessibles et aucun projet implicite n’est créé.

## Vérifications

- `pnpm check` : succès — catalogues i18n synchronisés et TypeScript sans erreur.
- `pnpm build` : succès — build Vite de production généré.
- Tests Vitest : **67 fichiers, 324 tests réussis**.
- Recette navigateur : clic sur **Simulation & analysis** réussi sur workspace vierge ; console sans erreur runtime ; vue Mission Control rendue avec cartes, métriques et commandes.
- Recette navigateur après reproduction du défaut WebGL : la sous-vue **Simulation & analysis** reste entièrement rendue avec le terrain de compatibilité ; console sans erreur non capturée.
- Fournisseur satellite vérifié : endpoint ESRI World Imagery HTTP 200, image JPEG 256×256 reçue.
- Preview vérifiée après build : HTTP 200 ; aucune modification du contrat de déploiement ou de la gestion WebGL existante.

## Mise en production

Déployer cette version puis effectuer un rechargement de la page. Le premier chargement désenregistrera l’ancien service worker et supprimera ses caches ; les bundles fingerprintés seront ensuite chargés depuis le déploiement courant. Aucun déploiement distant n’a été déclenché depuis cette session.
