# Variables d’environnement Render — AeroMinD.IA

Ce guide est additif. Il ne modifie pas les rapports d’ingénierie existants et ne réalise aucun déploiement à distance.

## Variables du blueprint actuel

| Variable | Configuration | Notes |
|---|---|---|
| `AEROMIND_ENV` | `production` dans `render.yaml` | Mode de l’application Python. |
| `PORT` | `10000` dans le blueprint | Le serveur écoute sur le port injecté par Render. |
| `DATABASE_URL` | Référence `fromDatabase` vers `aeromind-db` | Render fournit la chaîne PostgreSQL depuis le service associé. Ne pas la committer ailleurs. |
| `AEROMIND_SESSION_SECRET` | Généré par Render (`generateValue: true`) | L’application exige au moins 32 octets. Ne pas réutiliser cette valeur dans un fichier. |
| `DEFAULT_DEMO_EMAIL` | `mcgregoralvin14@gmail.com` dans le blueprint | Paramètre d’environnement, modifiable ou supprimable depuis le Dashboard Render. La configuration seule n’envoie aucun message et n’accorde aucun droit d’accès. |
| `AEROMIND_MAVLINK_OBSERVER_URL` | Optionnelle, non synchronisée | L’observateur existant est strictement en lecture seule. N’activer que si un endpoint de forwarding SITL est réellement disponible. URI par défaut du code : `udpin:127.0.0.1:14551`. |
| `HARDWARE_CONTROL` | `false` dans le blueprint | Ne pas activer pour le banc SIM. |

`NODE_ENV` n’est pas utilisé comme sélecteur de mode backend ; le projet utilise `AEROMIND_ENV`. `SECRET_KEY` est le nom générique suggéré dans le texte joint, mais le code attend `AEROMIND_SESSION_SECRET`, déjà généré par Render dans le blueprint.

## Mise à jour ou suppression de l’adresse de démonstration

Dans le Dashboard Render, ouvrir le service `aeromind-ai`, puis **Environment**. Modifier `DEFAULT_DEMO_EMAIL` ou supprimer la variable pour désactiver cette valeur. Après changement, déclencher le redéploiement/restart approprié. Ne pas ajouter l’adresse à `AEROMIND_SUPERADMIN_EMAILS` à moins qu’une attribution distincte et explicitement autorisée de privilèges soit voulue.

Le dépôt ne contient pas de transport SMTP ni de tâche d’envoi de courriels : `DEFAULT_DEMO_EMAIL` fournit un réglage disponible à l’application, mais ne déclenche aucun e-mail tant qu’un service d’envoi distinct n’a pas été configuré et approuvé.

## Déploiement

Le blueprint existant contient déjà le service web, le port, la base de données et la génération du secret de session. Pour créer ou mettre à jour un déploiement, l’opérateur doit revoir le diff dans Render et définir les identifiants OIDC requis dans le Dashboard. Aucune connexion au compte Render n’a été réalisée par cette modification locale.

## Registre Super-Admin en base et prérequis Entra
Le registre des autorisations se trouve dans les tables `admin_accounts` et `admin_account_events` de `DATABASE_URL` (base PostgreSQL Render). Le blueprint permet `AEROMIND_AUTO_CREATE_SCHEMA=true`; le compte base doit donc pouvoir créer les nouvelles tables lors du démarrage. Si l’auto-création est désactivée, appliquer `migrations/2026-10-21_admin_account_registry.sql` avant le déploiement. Les éventuels fichiers de registre JSON présents dans `data/` sont importés puis archivés `.migrated` par le premier démarrage réussi.

La console n’invite pas et ne provisionne pas de nouveaux utilisateurs Entra. Chaque adresse autorisée doit déjà correspondre à une identité Microsoft Entra dans le tenant correspondant à `ENTRA_TENANT_ID` (ou à `OIDC_ISSUER` Microsoft Entra). Le bouton de connexion est désactivé tant que l’issuer Entra n’est pas configuré.
