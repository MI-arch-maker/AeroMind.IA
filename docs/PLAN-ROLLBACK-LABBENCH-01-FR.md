# Plan de retour arrière (Rollback) — AeroMind LABBENCH-01

**Document**: PLAN-ROLLBACK-LABBENCH-01-FR.md
**Date**: 25 octobre 2026
**Statut**: Approuvé pour préproduction ; exige validation G3-G5 avant essais physiques
**Auteur**: Audit multi-agents — exécution du cahier des charges Option C FAST-TRACK

## 1. Objectif

Ce document décrit la procédure complète de retour arrière pour la mise en œuvre
du cahier des charges maître AeroMind LABBENCH-01 (Option C FAST-TRACK).
Chaque lot livré (Lots A-F) est réversible, soit via une migration SQL de
retour, soit via une commande git revert documentée.

## 2. Préalables obligatoires

- **Sauvegarde complète** de la base de données PostgreSQL/TiDB avant chaque
  migration. Stockée dans `backups/pre-migration-YYYY-MM-DD.sql.gz`.
- **Branche Git dédiée** pour chaque lot. Les commits sont atomiques et
  individualisables pour permettre un `git revert` ciblé.
- **Inventaire** des fichiers modifiés conservé dans `docs/audit/changelog-YYYY-MM-DD.md`.
- **Tests de non-régression** exécutés AVANT chaque déploiement (cf. CI).

## 3. Procédure de rollback par lot

### Lot A — Baseline (inventory + reproduire défauts)
- **Impact**: aucun ; documentaire uniquement.
- **Rollback**: supprimer `docs/audit/baseline-2026-10-25.md`.
- **Commande**: `git revert <commit-baseline>`.

### Lot B — Identité et autorisations (labbench_auth + session_store)
- **Fichiers concernés**:
  - `web/labbench_auth.py` (nouveau)
  - `web/session_store.py` (nouveau)
  - `web/canonical_models.py` (nouveau — LabSession, AuditEventExt)
  - `migrations/2026-10-25_canonical_labbench_schema.sql` (nouveau)
- **Rollback DB**: exécuter la section "ROLLBACK SCRIPT" en bas du fichier
  de migration :
  ```sql
  BEGIN;
  DROP TABLE IF EXISTS lab_sessions CASCADE;
  DROP TABLE IF EXISTS audit_events_ext CASCADE;
  COMMIT;
  ```
- **Rollback code**: `git revert <commit-lot-b>`.
- **Effet**: les sessions step-up ne sont plus vérifiées ; l'application
  retourne au schéma d'authentification précédent (cookies AeroMind uniquement).

### Lot C — Modèle canonique drone/projet/revision
- **Fichiers concernés**:
  - `web/canonical_models.py` (DroneRevision, Measurement)
  - `web/labbench_canonical_api.py` (nouveau)
- **Rollback DB**:
  ```sql
  BEGIN;
  DROP TABLE IF EXISTS measurements CASCADE;
  DROP TABLE IF EXISTS test_runs CASCADE;
  DROP TABLE IF EXISTS drone_revisions CASCADE;
  COMMIT;
  ```
- **Rollback code**: `git revert <commit-lot-c>`.
- **Effet**: les révisions de drones ne sont plus persistées ; les essais
  reviennent au schéma Simulation (synthetic=true, persisted=false).

### Lot D — API + événements + outbox + reprise connexion
- **Fichiers concernés**:
  - `web/canonical_models.py` (EventOutbox)
  - `web/labbench_canonical_api.py` (events endpoint)
- **Rollback DB**:
  ```sql
  BEGIN;
  DROP TABLE IF EXISTS event_outbox CASCADE;
  COMMIT;
  ```
- **Rollback code**: `git revert <commit-lot-d>`.
- **Effet**: la synchronisation événementielle redevient best-effort (pas
  d'outbox transactionnelle).

### Lot E — Sécurité matérielle (SEC-01 à SEC-07)
- **Fichiers concernés**:
  - `web/mavlink_command_api.py` (modifié — Gate 0 context required)
  - `web/mavlink_pool.py` (modifié — owner_id binding)
  - `web/hardware_gate.py` (modifié — signed token)
  - `web/geofence_validator.py` (modifié — DB-backed geofence)
  - `web/mission_planner.py` (modifié — ACK protocol)
  - `web/mavlink_telemetry_api.py` (modifié — auth + consent)
- **Rollback DB**:
  ```sql
  BEGIN;
  DROP TABLE IF EXISTS hardware_tokens CASCADE;
  DROP TABLE IF EXISTS geofence_records CASCADE;
  COMMIT;
  ```
- **Rollback code**: `git revert <commit-lot-e>`.
- **Effet**: les commandes matérielles retournent à leur état précédent
  ( moins restrictif — NE PAS déployer en production ).

### Lot F — Recette + docs + plan rollback
- **Impact**: aucun sur le runtime.
- **Rollback**: supprimer les documents livrés :
  - `docs/MATRICE-CONFORMITE-FR.md`
  - `docs/MANUEL-OPERATEUR-FR.md`
  - `docs/PLAN-ROLLBACK-LABBENCH-01-FR.md`
  - `tests/test_labbench_reception.py`

## 4. Procédure d'urgence (arrêt immédiat)

En cas de dysfonctionnement grave en production :

1. **Bascule HARDWARE_CONTROL=false** via Render Environment (effectif au
   redémarrage du worker, ~30 secondes). Cette action désactive TOUTES les
   sorties matérielles MAVLink (EXIGENCE C-001 fail-closed).
2. **Revoke toutes les sessions step-up** via `DELETE FROM lab_sessions WHERE state='active';`.
3. **Vérifier le statut** via `GET /api/health` et `GET /api/ready`.
4. **Si besoin, rollback du code** : `git revert <last-stable-commit>` puis
   redéployer via Render Dashboard (autoDeploy peut être désactivé).
5. **Restaurer la DB** depuis la sauvegarde pré-migration :
   ```bash
   gunzip -c backups/pre-migration-2026-10-25.sql.gz | psql $DATABASE_URL
   ```
6. **Notifier** l'équipe sécurité si des données ont pu fuir (audit_events_ext
   contient l'historique complet des décisions allow/deny).

## 5. Tests post-rollback

Après tout rollback, exécuter :

```bash
# Backend
pytest tests/ -v --tb=short

# Frontend
cd frontend && pnpm run check && pnpm test -- --run && pnpm run build

# End-to-end
pytest tests/test_labbench_reception.py -v -k "T01 or T08 or T15"
```

Les tests T01 (refus sans step-up), T08 (refus MAVLink sans owner), et T15
(refus télémétrie sans session) sont les sentinelles de sécurité — ils
doivent toujours passer après un rollback.

## 6. Conservation des artefacts

- Sauvegardes DB: 90 jours (rétention légale)
- Logs d'audit (audit_events_ext): 1 an minimum (EXIGENCE IAM-05)
- Événements outbox: 90 jours
- Tokens matériels consommés: 1 an (audit sécurité)

## 7. Contacts et escalade

- **Responsable sécurité**: à définir avant passage G3
- **DBA**: à définir avant migration production
- **Procédure d'incident**: cf. `docs/PROCEDURE-INCIDENT-FR.md` (à compléter)

## 8. Critères de non-retour arrière

Le rollback est INTERDIT si :
- Des essais physiques G5 ont été conduits (les données matérielles ne peuvent
  pas être annulées).
- Le rapport de recette a été signé par le responsable sécurité.
- Le système a dépassé 30 jours en exploitation G5 (les schémas ont été
  migrés en production stable).
