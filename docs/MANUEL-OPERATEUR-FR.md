# Manuel opérateur — AeroMind LABBENCH-01

**Version**: 1.0
**Date**: 25 octobre 2026
**Public**: Opérateurs LABBENCH, administrateurs, responsables sécurité

## 1. Rôles et responsabilités

| Rôle | Permissions | Responsabilités |
|---|---|---|
| `reader` | Lecture uniquement | Consulter projets, drones, essais, mesures, télémétrie |
| `designer` | Lecture + écriture drones | Créer/réviser configurations drone, dessins, matériaux |
| `analyst` | Lecture + création essais | Démarrer/annuler des essais, consulter mesures |
| `operator` | Lecture + requête commande | Demander une commande matérielle (requiert approbation) |
| `approver` | Lecture + approbation commande | Approuver/refuser les commandes matérielles (≠ opérateur) |
| `admin` | Toutes | Gérer membres, géofences, gates, paramètres |

**Important**: l'`operator` et l'`approver` DOIVENT être deux identités
distinctes (EXIGENCE IAM-03). Une même personne ne peut pas approuver sa
propre commande.

## 2. Démarrer une session LABBENCH (step-up)

### Prérequis
- Compte AeroMind actif (authentification OIDC/Entra)
- Appartenance à un projet (vérifiée par l'administrateur)
- Code MFA TOTP disponible (application Google Authenticator, 1Password, etc.)

### Procédure

1. **Se connecter à AeroMind** via la page de login (Microsoft Entra).
2. **Naviguer vers LABBENCH** — l'interface vous demandera une authentification renforcée.
3. **Saisir le code MFA TOTP** à 6 chiffres (renouvelé toutes les 30 secondes).
4. **Confirmer le projet** auquel la session sera liée.
5. **La session step-up est émise** pour 15 minutes (renouvelable).

### En cas d'échec

- Code MFA invalide → vérifier l'horloge système (TOTP dépend de la synchro temps)
- Projet introuvable → contacter l'administrateur pour ajout au registre
- Session expirée → redemander une authentification step-up

## 3. Sélectionner un drone

### Depuis la Bibliothèque des cellules

1. Ouvrir la Bibliothèque des cellules dans AeroMind.
2. Choisir une cellule (ex. quadcopter X500, hexacopter, voilure fixe).
3. Le système crée automatiquement une `DroneRevision` persistée côté serveur.
4. Le `drone_id`, `revision_id`, `checksum`, `origin_type` sont renvoyés.
5. À l'ouverture de LABBENCH, ces valeurs sont chargées — vérifier la cohérence.

### Depuis le Dessin de drones

1. Ouvrir le Studio de conception.
2. Dessiner ou modifier la géométrie (envergure, longueurs, etc.).
3. Définir les masses, l'inertie, la propulsion, les unités.
4. **Sauvegarder** — le système crée une nouvelle `DroneRevision` (numérotée).
5. Le `checksum` (SHA-256) garantit l'intégrité de la configuration.

### Vérification à l'entrée LABBENCH

À l'ouverture de LABBENCH, l'interface affiche :
- `drone_id` et `drone_name`
- `revision_id` et `revision_number`
- `checksum` (premier segment)
- `origin_type` (catalog / sketch / imported)
- `last_sync_at` (horodatage UTC de la dernière synchronisation)
- `activated_at` (horodatage de l'activation de la révision)

**Si ces valeurs ne correspondent pas à votre attente, NE PAS démarrer d'essai.**

## 4. Démarrer un essai

### Prérequis
- Session step-up valide (15 minutes max)
- Drone actif avec révision persistée
- Scénario d'essai défini

### Procédure

1. Sélectionner un scénario (nominal, masse extrême, panne moteur, etc.).
2. Choisir le `source_type` :
   - `synthetic` (DEMO/SIMULATION) — généré localement
   - `sitl` (SITL) — simulateur ArduPilot SITL
   - `hil` (HIL) — banc hardware-in-the-loop
   - `physical` (HARDWARE) — drone réel (nécessite gates G3-G5)
3. Démarrer l'essai — un `TestRun` est créé avec `state=pending`.
4. Pendant l'essai, les mesures sont horodatées et stockées avec leur `source_type`.
5. À la fin, `state` passe à `completed` ou `failed`.

### Lecture des résultats

Chaque mesure expose :
- `metric` (ex. altitude, vitesse, courant)
- `value` (valeur numérique)
- `unit` (m, m/s, A, etc.)
- `quality` (good / warn / fail / unknown)
- `source_type` (synthetic / sitl / hil / physical)
- `persisted` (true/false)
- `timestamp_utc` (horodatage UTC ISO 8601)
- `calibration_id` (si applicable)

**Une mesure DEMO ne peut PAS être marquée persisted=true.** Vérifiez
l'origine avant toute décision basée sur les résultats.

## 5. Télémétrie MAVLink

### Activation du polling

1. La télémétrie MAVLink est EN LECTURE SEULE — aucune commande n'est envoyée.
2. Avant de poller, **accorder le consentement** via `POST /api/telemetry/mavlink/consent`.
3. Le consentement est valable pour la durée de la session step-up.
4. Le polling retourne un état explicite : `fresh`, `stale`, `offline`, `error`.

### États

| État | Définition | Action recommandée |
|---|---|---|
| `fresh` | Heartbeat récent (< timeout) | OK, données exploitables |
| `stale` | Heartbeat ancien (> 6× timeout) | Vérifier la liaison, données à confirmer |
| `offline` | Pas de heartbeat | Aucune donnée disponible — ne pas baser de décision dessus |
| `error` | Erreur observateur | Contacter l'administrateur système |

### Arrêt d'urgence (e-stop)

L'arrêt d'urgence envoie `NAV_LAND` à tous les drones enregistrés dans le pool.
**NE PAS confondre avec un arrêt physique garanti** (EXIGENCE C-003). C'est
une commande de repli logiciel — le drone peut ne pas l'exécuter correctement
si l'autopilote est défaillant.

## 6. Commandes matérielles (HARDWARE mode)

### Conditions préalables (EXIGENCE C-001)

Pour activer le mode HARDWARE :
1. `HARDWARE_CONTROL=true` (variable d'environnement)
2. Gates G0 à G5 TOUTES approuvées (cf. section 7)
3. Drone enregistré dans le pool matériel via `POST /api/hardware/pool/register`
4. Géofence persistée et valide pour le projet
5. Opérateur authentifié avec session step-up valide
6. Approbateur différent de l'opérateur, avec session step-up valide
7. Token signé émis via `POST /api/hardware/gate/issue-token`
8. Token consommé atomiquement lors de l'envoi de la commande

### Procédure

1. **Opérateur** prépare la commande (ex. NAV_TAKEOFF, altitude 10m).
2. **Opérateur** demande un token signé à l'**approbateur**.
3. **Approbateur** vérifie la commande exacte et approuve (token émis pour
   cette commande précise, avec hash des paramètres).
4. **Opérateur** envoie la commande dans les 5 minutes (TTL du token).
5. Le token est consommé atomiquement — impossible à réutiliser.
6. Audit log enregistré à chaque étape.

### Refus possibles

- Token expiré (> 5 min)
- Token déjà consommé (rejeu)
- Mismatch projet/drone/commande/paramètres
- Approbateur == opérateur (EXIGENCE IAM-03)
- Géofence absente ou invalide (SEC-04 fail-closed)
- HARDWARE_CONTROL=false ou gates manquantes

## 7. Portes de validation (G0-G5)

| Porte | Qui approuve | Conditions |
|---|---|---|
| G0 — Gel | Admin | Sauvegarde, branche, inventaire matériel, HARDWARE_CONTROL=false |
| G1 — Sécurité | Responsable sécurité | SEC-01 à SEC-07 corrigés + tests T01-T15 passent |
| G2 — Fiabilité | Tech lead | CI verte, migrations testées, schémas audités |
| G3 — Banc protégé | Responsable banc | Analyse de risques, interverrouillages, watchdog, procédures |
| G4 — Qualification | Responsable sécurité | Essais reproductibles, limites documentées |
| G5 — Exploitation | Direction | Autorisation réglementaire, formation, maintenance, supervision |

**Jusqu'à G5 signée, aucune commande matérielle n'est émise, même si
HARDWARE_CONTROL=true.**

## 8. Conflit d'édition (SYNC-05)

Si deux utilisateurs modifient le même drone simultanément :
1. Les deux révisions sont créées (numérotées séquentiellement).
2. Aucune n'écrase l'autre.
3. L'interface affiche les deux révisions — l'utilisateur choisit laquelle activer.
4. Activation = `POST /api/lab/drones/{drone_id}/revisions/{rev_id}/activate`.

## 9. Mode hors ligne (OFFLINE)

Si le backend est indisponible :
- Le mode passe à `OFFLINE`
- Aucune commande matérielle n'est possible
- Les brouillons locaux sont conservés (localStorage) mais marqués `persisted=false`
- À la reconnexion, les brouillons peuvent être sauvegardés sur le serveur

**Aucune donnée DEMO ne peut être marquée persistée.**

## 10. Procédure d'incident

En cas de dysfonctionnement :
1. **Arrêt immédiat** : basculer `HARDWARE_CONTROL=false` via Render Environment.
2. **Révoquer les sessions** : `DELETE FROM lab_sessions WHERE state='active';`
3. **Vérifier le statut** : `GET /api/health` + `GET /api/ready`.
4. **Consulter l'audit** : `SELECT * FROM audit_events_ext ORDER BY occurred_at DESC LIMIT 100;`
5. **Si nécessaire** : rollback code via `git revert` (cf. PLAN-ROLLBACK).
6. **Notifier** le responsable sécurité si une fuite de données est suspectée.

## 11. Maintenance

- **Rétention audit**: 1 an minimum (audit_events_ext)
- **Rétention outbox**: 90 jours
- **Rétention tokens consommés**: 1 an
- **Sauvegardes DB**: quotidiennes, conservation 90 jours
- **Tests CI**: à chaque PR et push
- **Mises à jour de sécurité**: dependabot activé (à configurer sur le dépôt)

## 12. Contacts

- **Responsable sécurité**: à définir avant passage G3
- **DBA**: à définir avant migration production
- **Procédure d'incident**: cf. `docs/PROCEDURE-INCIDENT-FR.md` (à compléter)
