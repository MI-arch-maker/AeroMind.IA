# Configuration TiDB Cloud pour AeroMind

La table `audit_reports` visible dans la capture n’est pas une table déclarée par AeroMind. L’application utilise actuellement 14 tables, dont `audit_events` pour le journal de validation projet-scopé : `users`, `projects`, `user_settings`, `hardware_logs`, `command_requests`, `drones`, `simulations`, `reports`, `lab_sessions`, `prototype_versions`, `command_audit_events`, `workflow_runs`, `engineering_documents` et `audit_events`.

## 1. Sélectionner la bonne base

Dans TiDB SQL Editor, sélectionner la base `test` — ou remplacer `test` par le nom réellement présent dans `DATABASE_URL` Render. Le schéma doit être créé dans la même base que celle située après le dernier `/` de `DATABASE_URL`.

## 2. Créer le schéma

Pour une base neuve, ouvrir `TIDB_SCHEMA.sql`, le coller dans SQL Editor, puis cliquer sur **Run**. Cette opération doit être effectuée avec un compte TiDB qui possède les privilèges `CREATE`, `ALTER`, `INDEX` et `REFERENCES` sur la base `test`.

Pour une base AeroMind déjà en service, ne pas rejouer tout le schéma : appliquer seulement `migrations/2026-10-21_validation_audit_events.sql` avec un compte administrateur avant le déploiement du code. La création automatique est désactivée en production.

Après exécution, vérifier :

```sql
SHOW TABLES;
```

Les 14 tables AeroMind doivent apparaître. La table `audit_reports` peut rester présente, mais elle n’est pas utilisée par le code actuel.

## 3. Vérifier l’utilisateur Render

Dans Render, `DATABASE_URL` doit pointer vers TiDB avec le nom de base correct et le compte qui possède au minimum `SELECT`, `INSERT`, `UPDATE`, `DELETE` sur les tables AeroMind. Ne pas mettre les identifiants dans le dépôt Git.

La forme attendue est :

```text
mysql://UTILISATEUR:MOT_DE_PASSE@HOTE_TIDB:4000/test
```

Le code convertit automatiquement `mysql://` en `mysql+pymysql://` et active TLS vérifié. Si la base s’appelle autrement, remplacer `/test` dans l’URL.

## 4. Variables Render à conserver

```text
AEROMIND_ENV=production
AEROMIND_AUTO_CREATE_SCHEMA=false
DATABASE_URL=<URL TiDB Cloud complète, incluant /test>
```

`AEROMIND_AUTO_CREATE_SCHEMA=false` est volontaire : le compte applicatif ne doit pas avoir besoin du privilège `CREATE` pendant chaque redémarrage. Le schéma est installé une fois par un compte administrateur.

## 5. Contrôles après redéploiement

Après le redéploiement, vérifier :

```text
https://<service>.onrender.com/api/ready
https://<service>.onrender.com/api/health
```

`/api/ready` doit répondre HTTP 200. `/api/health` doit indiquer `"db":"connected"`. Si `/api/health` indique `disconnected`, le problème restant est nécessairement l’URL, la base sélectionnée, le mot de passe ou les privilèges de l’utilisateur Render.
