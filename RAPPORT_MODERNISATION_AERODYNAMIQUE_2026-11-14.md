# Aeromind.IA — Modernisation Aérodynamique

**Livraison du 14 novembre 2026.** Référence : archive `Aeromind.IA.zip` fournie par l’utilisateur. Périmètre : interface Aérodynamique, données locales associées et cycle de vie de son viewport WebGL 2. L’architecture et le style existants ont été conservés.

## Résultat de l’inspection

Sans aucun projet sélectionné, l’ancienne interface présentait notamment une vitesse de 22 m/s, une densité de 1,225 kg/m³, une traînée de 9,56 N, une portance de 82,38 N et un rapport L/D de 8,61. Ces valeurs provenaient de valeurs de démonstration et de modèles analytiques non étalonnés, pas d’une simulation CFD ou de mesures. Les estimations de domaine, cellules et RAM reposaient également sur des hypothèses locales.

Le viewport disposait d’un contexte WebGL 2 réel, mais son nettoyage ne libérait pas explicitement le contexte GPU dans tous les chemins. Une initialisation interrompue pouvait conserver des contrôles et références ; une erreur dans la file partagée pouvait bloquer les demandes suivantes. Les réglages d’unités ne mettaient pas toujours à jour les dimensions inspectées.

## Données synthétiques supprimées

Le formulaire s’ouvre désormais vide, sans architecture sélectionnée ni valeurs physiques par défaut. Aucune configuration du cockpit n’est recopiée automatiquement sans provenance vérifiable. Les métriques analytiques, résultats rotor théoriques, pression/densité dérivées, estimations de maillage/ressources, faux historiques et exports de résultats artificiels ont été retirés du parcours de cette interface. Les fonctions de calcul historiques restent dans la bibliothèque pour préserver le code partagé, mais ne sont plus appelées par ce module.

Les espaces CFD, pression, rotor, maillage et rapports affichent explicitement l’absence de résultats. Aucun solveur OpenFOAM n’est raccordé : les actions de calcul et maillage sont désactivées. Les exports accessibles contiennent seulement les conditions saisies et la préparation documentaire ; `result`, `mesh` et `convergence` sont `null`. Les champs numériques absents restent absents, y compris après sauvegarde et relecture JSON ; un zéro saisi n’est pas confondu avec une absence.

Les nouveaux scénarios enregistrés portent une provenance utilisateur explicite et un schéma versionné. L’historique synthétique connu est purgé à l’ouverture du module sur cette origine. Les enregistrements historiques non analytiques restent conservés, sans être présentés comme résultats vérifiés. Les scénarios hérités dont l’origine est ambiguë sont conservés séparément pour revue, plutôt que détruits arbitrairement ; ils ne sont ni affichés, ni exportés, ni réinjectés automatiquement. Les marqueurs explicitement synthétiques sont supprimés. Cette migration concerne le stockage du navigateur qui ouvre la version modernisée ; elle ne supprime pas les données d’un navigateur ou d’une installation distante non accessible depuis cette session.

## WebGL 2 et non-régression

Le renderer utilise exclusivement un contexte `webgl2` réellement détenu, avec deux profils d’initialisation (avec puis sans anticrénelage). Il n’y a ni contexte de sonde concurrent, ni repli 2D présenté comme une vue 3D. Chaque ressource est enregistrée dès son acquisition et nettoyée en cas d’échec partiel, démontage ou nouvelle tentative. Les contrôles, observateurs, listeners, matériaux, géométries auxiliaires, animations et temporisations sont libérés avant le contexte GPU. Le budget partagé reste conservateur, avec file FIFO, annulations et libération idempotente.

Une perte de contexte affiche un diagnostic et entraîne la reconstruction du viewport ; un bouton permet aussi une nouvelle tentative. Les unités de l’importer et de Settings suivent le même mécanisme de recalcul. Le modèle affiché reste celui du fichier importé ; aucune géométrie de drone de remplacement n’est créée. Les unités STL/OBJ/3MF restent à confirmer humainement, le parseur fourni ne convertissant pas automatiquement l’unité d’un document 3MF.

| Contrôle exécuté | Résultat |
|---|---|
| TypeScript + cohérence des catalogues i18n (`pnpm check`) | Réussi |
| Tests frontend (`pnpm test`) | 97 fichiers ; 508 tests réussis |
| Tests backend ciblés : ressources, régressions fonctionnelles, politique de capacités et contrôle virtuel | 43 réussis ; 1 ignoré |
| Build de production (`pnpm build`) | Réussi |
| API `/api/ready` | HTTP 200 ; base locale connectée ; mode simulation |
| Manifeste `/manus-routes.json` | HTTP 200 ; 38 routes existantes |
| Prévisualisation HTTPS du Centre Aérodynamique | HTTP 200 ; version compilée finale servie |
| Import OBJ issu de l’archive et contexte GPU | WebGL 2.0 / OpenGL ES 3.0 Chromium ; frames rendues |
| Présentation du modèle | 12 presets accessibles ; orbite et zoom opérationnels |
| Perte de contexte forcée | Reconstruction et reprise du rendu réussies |
| Remontages successifs du viewport | 8 transitions sans épuisement du budget de contextes |
| Redimensionnement à 1024 pixels | Rendu conservé |
| Initialisation partielle interrompue artificiellement pour le test | Nettoyage puis nouvelle tentative réussis |
| Refus de WebGL 2 injecté pour le test | Diagnostic et bouton de nouvelle tentative ; aucun faux fallback |
| Erreurs JavaScript / shaders lors de la recette principale | Aucune |

La comparaison de l’archive originale conserve **847 fichiers à l’identique** et ne supprime aucun fichier original. Les modifications des fichiers applicatifs existants sont limitées au centre Aérodynamique, à ses helpers/tests et au gestionnaire de créneaux de `PhysicalDroneModel` ; sa géométrie ainsi que les autres centres et le backend sont inchangés. Les changements fonctionnels retirant les données artificielles sont intentionnels. Aucune régression n’a été détectée dans les contrôles exécutés ; cela ne constitue pas une garantie absolue sur tous les parcours, équipements et navigateurs.

## Déploiement et limites explicites

Le build et le serveur complet FastAPI ont été exécutés. Le Dockerfile existant et son health check `/api/ready` sont déclarés pour un déploiement ultérieur ; le fichier `.env.example` manquant, requis par ce Dockerfile, a été restauré sans secret réel. Les dépendances et versions verrouillées sont conservées. L’archive contient les sources, le lockfile, la configuration de déploiement, les tests et les preuves, sans `node_modules`, caches, base locale, `.git` ni vrais fichiers d’environnement.

Le test graphique a été réalisé avec Chromium headless et ANGLE SwiftShader, donc avec une implémentation logicielle WebGL 2. Le code s’appuie sur les API standards des navigateurs compatibles, mais Chrome installé sur un poste physique, Edge, Firefox et Safari n’ont pas fait l’objet d’une matrice de recette GPU dans cette session. Un navigateur/pilote qui refuse WebGL 2 ne peut pas être forcé par une application ; l’erreur est alors explicite. Les modes avancés déjà indisponibles (VR, coupe de champ CFD, etc.) ne sont pas présentés comme implémentés.

Le Dockerfile n’a pas été exécuté via Docker dans cette machine ; installation verrouillée, compilation et runtime ont été testés directement. Le raccordement de votre base de production, les migrations et la configuration Entra/OIDC restent à configurer dans l’environnement de déploiement. La prévisualisation est une instance temporaire en mode virtuel, sans commande matérielle, et non une publication de production. Les avertissements préexistants concernant la taille de certains bundles et le script de configuration chargé par FastAPI demeurent non bloquants.

## Reproduction et preuves

Depuis la racine des sources, installer les dépendances Python avec `python3 -m pip install -r requirements.txt`. Dans `frontend`, utiliser le pnpm **10.18.0** déclaré dans `package.json`, puis `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test` et `pnpm build`. Éviter de mélanger plusieurs versions pnpm dans les scripts imbriqués.

Créer votre environnement local à partir du modèle documenté, générer un secret de session aléatoire, configurer la base et conserver `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et `AEROMIND_SITL_AUTOSTART=false` pour la prévisualisation. Démarrer à la racine avec `python3 -m uvicorn web.app:app --host 0.0.0.0 --port 3000`.

Les scripts `scripts/inspect_aerodynamic_browser.py` et `scripts/verify_aerodynamic_webgl2.py` reproduisent l’inspection et la recette avec Python Playwright et Chromium. Les captures, résultats JSON, comparaison des sources et journaux de tests/build sont sous `docs/evidence/aerodynamic-modernization-2026-11-14/`. Les essais utilisent un contexte de navigateur jetable et ne créent ni compte, ni tâche CFD, ni commande physique.

La fiche de prévisualisation et le raccourci `Aeromind.IA.url` livrés avec les sources contiennent l’adresse HTTPS temporaire vérifiée.
