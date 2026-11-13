# AeroMind — Audit global et deuxième vague de corrections

**Date :** 30 octobre 2026  
**Périmètre :** navigation/fenêtres; CAO/jumeau numérique; simulation/missions; atelier/matériaux; opérations, télémétrie et administration.

## Synthèse

Les constats ciblés du premier passage et les cinq points résiduels documentés ont été repris. La seconde passe a également révélé un risque de course au montage : des effets de persistance pouvaient écrire l’état vide avant la fin de l’hydratation du dock CAO. Un garde-fou lié à l’identité du design et des tests ont été ajoutés. Le même type de garde contre l’écrasement lors d’un changement de design a été ajouté à la checklist.

Aucun projet n’a été créé par ces modifications. Le plan de démonstration reste local jusqu’à une modification explicite; les nouvelles persistances concernent le navigateur et ne créent pas de projet ni d’écriture métier.

## Correctifs appliqués

| Domaine | Correction |
|---|---|
| Mode opérationnel / gates | HARDWARE exige un `project_id` explicite et six gates approuvées pour ce même projet. Une erreur de lecture de la base refuse l’activation (fail-closed). Le super-admin permet de saisir puis vérifier cet identifiant. Les autres modes désactivent `HARDWARE_CONTROL`, y compris SITL/HIL. |
| Santé système / télémétrie | Compteurs avec `func.count()` SQLAlchemy et état dégradé visible si les statistiques échouent. Le seuil MAVLink `offline` est vérifié avant `stale`. |
| Mission Planner / plan partagé | Chargement des waypoints partagés sans écraser la mission au simple affichage; la démonstration reste locale jusqu’à une édition explicite. Les outils carte Geofence/Rally, Mesurer et Effacer Survey ont des effets visibles; les actions non implémentées ne simulent plus un succès. |
| Mutations mission | Vérification des réponses HTTP pour créer/sauvegarder/téléverser/supprimer, messages accessibles y compris erreurs FastAPI/réseau, préservation du plan local si sauvegarde échouée et distinction entre mutation réussie et actualisation de liste échouée. Un upload HTTP positif sans détail de résultat n’est plus présenté comme confirmé. |
| Dock CAO | « Aperçu de coupe » indique clairement que la géométrie n’est pas modifiée. Les tolérances sont incluses dans les nouvelles variantes; les variantes enregistrées peuvent être comparées A/B sur les seuls champs disponibles. Un garde d’hydratation empêche d’écraser les variantes, calques et assemblages d’un design avant d’avoir chargé son état. |
| Checklist physique | Persistance locale versionnée, gestion des données obsolètes/malformées et affichage d’un statut en cas d’échec de stockage. La nouvelle clé n’est jamais écrite avec les anciennes cases avant restauration. L’identité repose sur le profil catalogue ou une empreinte stable des attributs de conception disponibles. |
| Catalogue matériaux | Chargement initial unifié, annulation/filtrage des réponses obsolètes, recherche temporisée, gestion des erreurs HTTP/réseau et conservation visible des dernières données périmées; actualisation impérative préservée. |
| Navigation | Retrait du lien factice `/some-path`; largeur de sidebar validée et bornée; accès au stockage protégé; libellés accessibles ajoutés aux contrôles concernés. |
| Responsive | Règles mobiles ajustées pour que seule la fenêtre maximisée occupe l’écran et que les géométries flottantes soient recalées au redimensionnement. |

## Validation consolidée

Après l’ensemble des corrections, `pnpm check` a réussi (catalogues de langue et TypeScript), `pnpm test` a réussi avec **61 fichiers et 294 tests**, et `pnpm build` a terminé avec succès. Les tests backend ciblés de régression projet, workspace et garde-fous opérationnels ont réussi : **20 réussis, 1 ignoré**. Les fichiers backend concernés avaient également passé `py_compile` dans le premier passage.

Le build conserve des avertissements non bloquants de taille de bundles et le script runtime `/api/platform/config.js` non bundlé sans `type="module"`. La suite Python émet une dépréciation Starlette/anyio. Aucun de ces avertissements n’a fait échouer les commandes de validation.

## Limites et capacités non simulées

Le dock CAO ne réalise pas de coupe géométrique réelle et ne restaure pas une configuration entière depuis les variantes : le modèle de données exposé ne contient pas ces capacités, donc les commandes sont explicitement présentées comme aperçu/revue comparative, sans fausse promesse. Les variantes ne sauvegardent que les champs exposés. La checklist est conservée dans le stockage local du navigateur, pas synchronisée entre appareils ou vers le serveur.

Les tests du catalogue valident le helper d’URL, mais pas le cycle React complet/annulation en navigateur faute de test DOM dédié. Les mutations du composant mission sont compilées et ses helpers d’erreur testés, mais aucun test E2E de requête mission n’a été exécuté. L’audit ne constitue pas une activation réelle de drone ni un essai matériel.

Aucun parcours navigateur n’a exercé chaque bouton, écran, viewport, tactile et lecteur d’écran. Il n’est donc pas possible de certifier que tous les contrôles de toute l’application ont été individuellement testés ou de garantir l’absence absolue de régression. Les tests automatiques du périmètre exécuté sont verts; les interactions hors de ce périmètre restent à valider par un parcours E2E visuel.

## Compatibilité et traçabilité

Les intégrations qui demandent HARDWARE doivent désormais fournir `project_id`; le contrôle vérifie les gates propres à ce projet. Le dossier transmis n’expose pas de métadonnées Git dans cet environnement, donc aucun `git diff/status` n’a pu être produit. Les modifications et les fichiers concernés sont décrits dans ce rapport; l’archive de livraison exclut `.env`, les dépendances installées, caches et bases locales.
