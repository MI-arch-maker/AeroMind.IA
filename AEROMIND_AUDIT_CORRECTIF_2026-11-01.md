# AEROMIND — Audit correctif structuré

**Référence :** AEROMIND–GOV–004  
**Date :** 1 novembre 2026  
**Périmètre :** audit et correction ciblés des chemins N3, gates G0–G5 et commandes MAVLink, plus validations frontend/backend et preview isolée.  
**État :** les trois corrections autorisées ont été appliquées dans la copie de travail. Aucun processus SITL, transport MAVLink, équipement, migration distante ou publication production n’a été lancé.

## Corrections appliquées

1. **État N3 courant après désarmement.** Origine : `web/hardware_gate.py` recherchait tout événement historique `arm/active=true`, alors que `web/labbench.py` désarme en modifiant l’événement courant à `active=false`. Le calcul de gate et le contrôle d’identité de l’approbateur retiennent désormais le dernier événement d’armement et son état actif courant. La simulation reste inchangée. Régression ajoutée : arm → désarmement → gate faux → nouvel armement → gate vrai.

2. **Vérification G0–G5 fail-closed.** Origine : `web/hardware_gate.py` poursuivait l’émission du jeton si la lecture des gates échouait hors de `AEROMIND_ENV=production`, y compris en staging. La vérification est maintenant centralisée ; toute gate absente renvoie `GATE_NOT_READY`, et toute erreur de lecture renvoie `GATE_CHECK_FAILED` dans tous les environnements. Le helper de test n’avale plus les erreurs de création de gates. Cela ne bloque que les autorisations qui dépendent de portes impossibles à vérifier, sans neutraliser les simulations indépendantes.

3. **Protocole mission distinct de `COMMAND_LONG`.** Origine : les messages de protocole `MISSION_COUNT` et `MISSION_ITEM_INT` avaient été ajoutés à l’allowlist générique et à `MAV_CMD_IDS`, alors que `send_command()` les transmettait par `command_long_send`. Ils ont été retirés de cette allowlist et de cette table. Le transfert mission dédié via `MISSION_UPLOAD` et `mavlink_mission_protocol.upload_mission()` reste distinct et n’a pas été supprimé. Le helper `_issue_mission_item_token` non référencé dans le module mission reste inchangé ; il constitue une dette de nettoyage séparée, car le flux actuel consomme un jeton `MISSION_UPLOAD`.

Les trois modifications sont tracées dans [le patch de réversibilité](AEROMIND_AUDIT_CORRECTIF.patch). Les copies initiales sont conservées temporairement hors archive dans `.audit-backup/`.

## Validation effectuée

- **Backend ciblé :** 76 tests réussis dans `test_hardware_phases.py`, `test_mavlink_mission_protocol.py`, `test_e2e_hardware_http.py` et `test_virtual_control.py`. Une dépréciation tierce a été signalée ; aucun test ne dépend d’un SITL ou d’un transport réel.
- **Frontend :** contrôle TypeScript réussi ; catalogue i18n synchronisé (**2 617 clés**) ; Vitest réussi (**75 fichiers, 363 tests**) ; build Vite réussi (**7 433 modules transformés**). Le build conserve un avertissement non bloquant sur quelques bundles dépassant 1,5 Mo.
- **Syntaxe Python :** `py_compile` réussi sur les trois fichiers Python modifiés.
- **Preview HTTPS relayée :** index, `/api/health`, `/api/ready`, `/api/hardware/status`, `/manus-routes.json`, `/?view=parametric-center`, `/?view=mission-center`, `/?view=command-center` et `/labbench` ont tous répondu HTTP 200. Réponse vérifiée de l’état matériel : `hardwareControlEnabled=false`, `virtualOnly=true`, `allowedCommands=[]`, `physicalOutputEnabled=false`, `physicalCommandsEmitted=false`; l’API indique `mode=simulation`.
- **Secrets/artefacts :** le scan des marqueurs courants de clés privées et de clés API n’a trouvé aucune correspondance dans les sources incluses ; aucun fichier `.env` réel n’a été trouvé. `.env.example` est conservé. Le ZIP exclut les environnements virtuels, dépendances installées, builds, bases SQLite et sauvegardes de travail.

## Limites et état de la preview

La preview actuellement vérifiée est un **relais HTTPS temporaire de ce sandbox**, maintenu tant que ses deux services (API locale et Vite) restent actifs. Elle utilise une base SQLite temporaire locale avec `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et `AEROMIND_SITL_AUTOSTART=false`.

L’initialisation d’une preview WebDev gérée a échoué car l’espace de travail sandbox par défaut contient déjà des fichiers et ne peut pas être enregistré comme nouveau projet sans déplacer l’ensemble de cet espace. Les fichiers Aeromind ont été préservés ; ils n’ont pas été déplacés. En conséquence, l’URL temporaire ne doit pas être présentée comme une preview WebDev stable ou une publication. Le suivi `TODO.md` garde ce point ouvert.

Aucune activation matérielle, émission réelle, connexion à un aéronef, exécution SITL, migration distante ou publication production n’a été effectuée. Les fonctions virtuelles existantes ont été préservées ; ce travail ne certifie ni l’exploitation réelle ni la conformité réglementaire.

## Note de transparence — télémétrie de test

L’environnement d’exécution disposait d’un `SENTRY_DSN`. À la fermeture de la suite de tests backend, le SDK a affiché une tentative de vidage d’un événement ; sa réception par un service externe n’est pas confirmable depuis cette session. La valeur du DSN n’a pas été affichée ni incluse dans le ZIP. Après constat, l’API de preview a été redémarrée avec `SENTRY_DSN` vide ; les vérifications de readiness et VIRTUAL ONLY ont de nouveau répondu correctement. Aucun autre test automatisé n’a été lancé après cette observation.
