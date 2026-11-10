# Livraison finale — AeroMind.IA

Date : 10 novembre 2026

## Consoles de gouvernance et d’opérations

La Console Administrateur expose maintenant dans son en-tête les commandes **Connexion**, **Déconnexion** et **Mise en veille**. La connexion reste explicite (Microsoft Entra ou MFA local). Déconnexion et veille appellent l’endpoint de révocation du cookie dédié; la veille affiche ensuite l’écran de reprise et exige une nouvelle authentification. Le cockpit utilisateur n’est pas connecté ni déconnecté par ces commandes.

La Console Super-Admin comprend un nouvel onglet **Centre d’opérations**. Il réunit le contrôle existant du mode opératoire et de la santé runtime avec un catalogue actualisable des capacités renvoyées par le backend. Le catalogue distingue l’activation technique d’une route de l’autorisation du compte; il ne lance pas de commandes arbitraires. L’ancien bouton qui ne faisait qu’écrire le résultat dans la console du navigateur a été retiré. La Super-Admin dispose également de commandes persistantes **Mise en veille** et **Déconnexion**.

Les consoles gardent leur séparation de session, leurs contrôles backend, les fonctions existantes de gestion de comptes, approbations, projets, rapports, niveaux et audit, ainsi que la présentation institutionnelle. Les commandes matérielles et d’arrêt d’urgence continuent de dépendre de leurs propres rôles, gates G0–G5, conditions de runtime et autorisations humaines. Elles ne sont pas ajoutées comme boutons génériques ni déclenchées automatiquement.

## Sécurité, isolation et autres changements livrés

- Matrice de capacités L1–L5 centralisée côté serveur; les niveaux L1–L3 restent dans leurs espaces personnels et les fonctions de gouvernance L4–L5 sont réservées aux rôles d’administration.
- Matériaux personnalisés associés à leur propriétaire; contrôles de propriété pour les créations mission, maintenance et cycles batterie; validation du pré-vol renforcée contre la falsification côté client.
- Registres Projets, Simulations et Journal filtrés au compte propriétaire, limités aux métadonnées et plafonnés à 100 éléments par section.
- Endpoint de test du gateway LLM interne protégé par session administrateur dédiée; il renvoie uniquement le statut et le modèle, sans URL, secret ni texte généré.
- Virtual Parametric Factory : aperçu 3D élargi basé sur le modèle existant; les réglages de prévisualisation ne créent pas de cellule persistante.
- Migration incluse : `migrations/2026-11-09_material_item_user_scope.sql` ajoute `material_items.user_id` et son index. Les anciennes lignes sans propriétaire ne sont pas rendues aux niveaux L1–L3.
- Pas d’abonnement, de paiement, de création automatique de drone ou de connexion automatique ajoutés.

## Vérifications

- Backend : **331 tests réussis, 14 ignorés** dans la suite complète actuelle.
- Frontend : `pnpm check` réussi; **79 fichiers de tests, 378 tests réussis** après les modifications des consoles.
- Production frontend : `pnpm build` réussi après les modifications. Il subsiste un avertissement non bloquant de bundles volumineux et celui du script de configuration runtime non-bundleable.
- Le test d’intégration du registre et du flux LLM simulé passe. Le gateway AeroMind réel n’était pas configuré dans cet environnement; sa disponibilité n’est donc pas revendiquée.

## Déploiement et limites

Pour vérifier réellement l’IA interne, configure `AEROMIND_LLM_DEPLOYMENT=aeromind`, `AEROMIND_LLM_BASE`, `AEROMIND_LLM_ALLOWED_HOSTS`, `AEROMIND_LLM_MODEL` et `AEROMIND_LLM_API_KEY` dans les secrets du service cible, puis lance le test depuis la Console Administrateur.

Applique une fois la migration SQL incluse à la base cible avant le déploiement. Le catalogue opérations présente l’inventaire fourni par `/api/ops/capabilities`; il ne prétend pas être un lanceur universel pour toutes les routes internes. Le dossier fourni ne possède pas de métadonnées Git : aucun commit, checkpoint ni déploiement distant n’est revendiqué.


## Actualisation — centre de supervision et gouvernance des consoles

La Console Super-Admin remplace maintenant les trois indicateurs déclaratifs par des sondes backend actualisées toutes les 30 secondes ou à la demande. Le backend exécute un `SELECT 1` et expose son résultat/temps, les compteurs agrégés autorisés, l’état OIDC et uniquement l’état de **configuration** du gateway LLM. Aucune URL, clé ou réponse du modèle n’est transmise au navigateur; la connectivité réelle du LLM reste un test ponctuel explicite dans la Console Admin, et n’a pas été testée dans cet environnement.

La supervision globale et le catalogue des capacités exigent désormais L5 au middleware central : un compte L1–L4 reçoit un refus backend; seul le Super-Admin peut consulter les données d’exploitation inter-tenant. L’onglet niveaux affiche les portées L1–L5 avec la primauté des contrôles par route, des propriétaires, des rôles et des interverrouillages. Le journal d’audit comporte recherche par événement/acteur/cible, type, période, pages de 25 lignes et export CSV des seules métadonnées filtrées. Le registre d’activité actuellement fourni à l’écran reste borné aux 100 événements les plus récents; le filtrage n’efface aucune donnée.

La suite backend complète passe à **331 tests réussis, 14 ignorés** (3 avertissements non bloquants de dépendances/collecte). Le frontend a réussi `pnpm check`, **79 fichiers de tests / 378 tests Vitest**, et `pnpm build`. Le build conserve un avertissement non bloquant sur les bundles JavaScript volumineux; la compilation aboutit. Aucun déploiement Render, test réseau réel du fournisseur LLM, changement de base distante ou activation matérielle n’a été effectué.
