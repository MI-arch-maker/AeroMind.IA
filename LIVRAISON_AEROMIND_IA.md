# Livraison — AeroMind.IA, matrice de capacités et gateway IA interne

## Résumé exécutif

La copie source AeroMind a été mise à jour avec un contrôle backend centralisé L1–L3 pour les domaines d’ingénierie et de simulation, un refus par défaut des API/procédures métier non classées pour les comptes L1–L3, ainsi qu’un parcours administrateur dédié pour tester une API LLM interne. Les secrets du modèle interne sont séparés de ceux d’un fournisseur externe. Aucune commande matérielle n’est accordée aux niveaux L1–L3.

Le contrôle L4/L5 ne remplace pas les autorisations locales, le contrôle de propriétaire, le step-up, les protections CSRF, les validations G01–G05 ou les interverrouillages matériels. L’application reste en sortie physique désactivée par défaut.

## Matrice de capacités implémentée

| Niveau | Capacités autorisées par le contrôle serveur |
|---|---|
| **L1 — Consultation et brouillon** | Lectures dans l’espace personnel, création d’un projet brouillon, simulations virtuelles de base et calculs explicitement non matériels, lecture du catalogue statique, parsing de commande virtuelle. Les appels métier exigent toujours une session, sauf endpoints publics explicitement maintenus. |
| **L2 — Ingénierie et simulation nominales** | Modifications d’ingénierie, snapshots persistés, gestion de cellules explicitement créées, simulations nominales persistées, rapports brouillons, checklists et plans d’entretien. Les ressources liées sont contrôlées par propriétaire lorsque la route accepte un projet ou une cellule. |
| **L3 — Analyse et workflow avancés** | Procédures de laboratoire et de qualification avancées, analyse SITL/CDF lorsqu’exposée, artefacts/imports/exports et preuves, exécution des checklists pré-vol, revues indépendantes. La route métier conserve aussi ses restrictions de rôle (par exemple, une revue de rapport exige toujours le rôle approprié). |
| **L4 — Administrateur** | Le contrôle de niveau central laisse passer les opérations nécessitant au moins L4; les contrôles de rôle et d’autorisation de chaque route restent obligatoires. L4 n’active pas à lui seul une sortie physique. |
| **L5 — Super-Admin** | Niveau effectif réservé au rôle `super_admin`; conserve les contrôles spécifiques de la Console Super-Admin et les barrières de la plateforme. |

Les routes matérielles, commandes, missions téléversées, vols et télémétrie MAVLink sont hors de L1–L3 (seuil L4 minimum) et restent assujetties à leurs interverrouillages existants. Ce seuil ne signifie pas qu’un administrateur peut matériellement commander un drone : les protections runtime et d’approbation restent indépendantes. Les mutations tRPC en GET sont rejetées; les mutations nécessitent POST. Toute API ou procédure métier non classée est refusée aux comptes L1–L3 par défaut. Les flux d’authentification, de console admin isolée, de workspace local à clé opaque et de santé publique sont explicitement distingués.

## Isolation et intégrité des enregistrements

- Les matériaux personnalisés sont désormais identifiés par propriétaire, filtrés par compte à la lecture et supprimables uniquement par leur propriétaire. Une migration de schéma est fournie.
- La création de missions, de checklists pré-vol et de dossiers d’entretien vérifie côté serveur que les projets/cellules liés appartiennent à l’identité active.
- Le résultat PASS d’une checklist est recalculé à partir des critères obligatoires stockés côté serveur; un client ne peut plus retirer un critère requis de la soumission pour obtenir un PASS.
- L’exemption CSRF générale du bridge tRPC a été retirée. Le client AeroMind transmet déjà `X-CSRF-Token` pour les mutations si une session step-up est active.

Les anciens matériaux personnalisés sans `user_id` sont laissés sans attribution par la migration et ne sont donc pas renvoyés aux comptes ordinaires. Le propriétaire historique ne pouvant être déduit de ces lignes, il faut soit les attribuer manuellement dans la base, soit les recréer dans l’espace du propriétaire approprié.

## Configuration de l’API LLM interne

Aucun endpoint, identifiant de modèle ou secret interne n’était présent dans l’archive ni fourni pour cette exécution. La connexion réseau réelle n’a donc pas été tentée et le mode interne n’est pas marqué « prêt » tant que les paramètres ci-dessous ne sont pas renseignés dans le gestionnaire de secrets/configuration du déploiement :

```dotenv
AEROMIND_LLM_DEPLOYMENT=aeromind
AEROMIND_LLM_BASE=https://llm-gateway.intra.example/v1
AEROMIND_LLM_ALLOWED_HOSTS=llm-gateway.intra.example
AEROMIND_LLM_MODEL=<identifiant-du-modele-deploye>
AEROMIND_LLM_API_KEY=<secret-dedie-fourni-par-le-vault>
```

Prérequis côté infrastructure :

1. Un endpoint interne compatible avec `POST <base>/chat/completions`, joignable depuis le processus AeroMind, avec un modèle et un identifiant de modèle déterminés.
2. Un nom DNS interne ou une IP privée; le nom/port exacts de l’URL (netloc) doivent figurer dans `AEROMIND_LLM_ALLOWED_HOSTS`. Les IP littérales publiques sont refusées par la validation de configuration. En production, HTTPS est obligatoire et le certificat/CA doit être approuvé par le runtime Python.
3. Une clé dédiée `AEROMIND_LLM_API_KEY` stockée dans le coffre du déploiement. Elle n’est jamais reprise depuis `OPENAI_API_KEY`, ni placée dans le frontend ou le dépôt.
4. Des règles réseau de sortie qui autorisent uniquement le gateway approuvé et bloquent les destinations publiques non voulues ainsi que les services de métadonnées cloud.

En développement seulement, un endpoint HTTP sur `localhost`, `127.0.0.1` ou `::1` est accepté si son netloc exact est autorisé. Le gateway utilise TLS avec validation de certificat par défaut, un délai de connexion de 5 secondes et un délai global de 30 secondes.

Après renseignement des variables, ouvrir **Console administrateur → Gateway IA interne → Tester la connexion interne**. Le bouton appelle `POST /api/admin-console/llm/validate` avec le cookie de session de console séparé; l’opération exige un rôle admin ou super-admin, exécute une complétion minimale et ne renvoie ni URL, ni secret, ni texte de réponse du modèle. En mode externe, ou si la configuration est incomplète/non autorisée, l’API répond explicitement sans lancer de requête.

Ce travail établit une passerelle AeroMind contrôlée; il ne crée pas des poids propriétaires, un cluster d’inférence ou un modèle autonome. L’IA reste consultative et ne peut pas émettre de commande physique.

## Livraison et vérification

- Migration fournie : [`migrations/2026-11-09_material_item_user_scope.sql`](migrations/2026-11-09_material_item_user_scope.sql). À appliquer une fois sur la base cible avant le déploiement du nouveau code; la configuration production n’effectue pas automatiquement les migrations DDL.
- Suite backend complète : **326 passed, 14 skipped**; 3 avertissements non bloquants préexistants (dépréciation Starlette et collecte de modèles ORM comme tests).
- Frontend : `pnpm check` et `pnpm build` réussis. Vite émet un avertissement de bundles volumineux, sans échec de build.
- Compilation Python et contrôles de whitespace réussis.
- Les tests du gateway valident la politique de configuration et l’utilisation exclusive de la clé/modèle internes avec un client simulé. **Aucun test réseau réel n’a été possible sans endpoint/secret de déploiement.**

## Déploiement conseillé

1. Appliquer la migration Materials sur préproduction et attribuer ou recréer les anciennes lignes sans propriétaire.
2. Déployer d’abord en préproduction; vérifier la session Entra/MFA, les niveaux L1/L2/L3 et les refus attendus sur une route matérielle et une route API non classée.
3. Renseigner les variables LLM internes via le gestionnaire de secrets, puis exécuter le bouton de test depuis la console dédiée. Vérifier aussi que les journaux et traces n’enregistrent pas l’en-tête d’autorisation.
4. Exécuter les parcours G01–G05, l’isolation multi-comptes, les tests de checklist et les scénarios de reprise avant promotion en production.
5. Conserver `HARDWARE_CONTROL=false` et `AEROMIND_VIRTUAL_ONLY=true` tant qu’une décision de gouvernance et une homologation matérielle distinctes ne les remplacent pas.
