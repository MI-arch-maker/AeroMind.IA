# Livraison finale — AeroMind.IA

Date : 10 novembre 2026

## Réalisations

- **Matrice L1–L5 et contrôle serveur :** politique de capacités centralisée et vérifications backend sur les opérations d’ingénierie et de simulation. Les privilèges L1–L3 demeurent limités à l’espace personnel; les fonctions de gouvernance L4–L5 sont réservées aux rôles d’administration autorisés.
- **Isolation des données :** matériaux personnalisés associés à leur propriétaire; contrôles de propriété pour les créations d’objets mission, maintenance et cycles batterie; validation du pré-vol renforcée contre les champs forgés côté client.
- **Sessions de console :** session Super-Admin distincte de la session applicative. La connexion administrative n’établit pas une connexion automatique dans AeroMind.
- **Console Administrateur :** registres Projets, Simulations et Journal intégrés à un endpoint à portée utilisateur. Les réponses sont limitées aux métadonnées, bornées à 100 entrées par section et ne comprennent ni payloads privés ni enregistrements d’autres comptes. Les filtres et états de chargement/erreur sont intégrés.
- **Console Super-Admin :** présentation de gouvernance institutionnelle et vue Approbations alimentée par les requêtes en attente; les erreurs de chargement ne sont pas assimilées à un résultat vide ni à une approbation.
- **Passerelle IA interne :** endpoint de validation protégé par la session administrateur distincte. Il envoie une requête minimale à la couche de complétion interne et ne renvoie que l’état de connexion et l’identifiant du modèle. URL, secret et réponse complète ne sont pas exposés à l’interface.
- **Virtual Parametric Factory :** aperçu 3D professionnel plus grand, basé sur le modèle existant; les réglages de prévisualisation ne créent pas de drone/cellule persistante.
- **Migration incluse :** `migrations/2026-11-09_material_item_user_scope.sql` ajoute `material_items.user_id` et son index. Les matériaux historiques restent sans propriétaire et ne sont donc pas exposés aux utilisateurs L1–L3.
- Aucun mécanisme d’abonnement, de paiement, de création automatique de drone ou de connexion automatique n’a été introduit.

## Vérifications exécutées

- Backend : **329 tests réussis, 14 ignorés**.
- Frontend : `pnpm check` réussi; **79 fichiers de tests, 378 tests réussis**.
- Production frontend : `pnpm build` réussi. Le bundler conserve un avertissement non bloquant sur des bundles volumineux.
- Test ciblé d’intégration : registres de workspace filtrés au propriétaire et validation LLM interne via complétion simulée; passe.
- Syntaxe Python des API/tests modifiés et JSON des catalogues français/anglais : valides.

## Limites et déploiement

Le test de la passerelle IA valide le parcours applicatif avec le transport de complétion simulé. Aucun secret ni gateway AeroMind réel n’était configuré dans cet environnement; une connexion opérationnelle au service privé n’a donc pas été vérifiée. Il faudra configurer les variables `AEROMIND_LLM_DEPLOYMENT=aeromind`, `AEROMIND_LLM_BASE`, `AEROMIND_LLM_ALLOWED_HOSTS`, `AEROMIND_LLM_MODEL` et `AEROMIND_LLM_API_KEY` dans le gestionnaire de secrets de l’environnement cible, puis exécuter le test depuis la Console Administrateur.

Avant déploiement, appliquer une seule fois la migration SQL incluse sur la base cible, puis déployer le backend et le frontend compatibles. Le dépôt fourni dans cet environnement ne contient pas de métadonnées Git; aucun commit, checkpoint ni déploiement distant n’est revendiqué.
