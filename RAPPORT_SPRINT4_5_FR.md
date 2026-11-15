# Rapport Sprint 4–5 — GCS, télémétrie et adaptateur WebSocket

## Périmètre livré

Le module `web/gcs_api.py` expose une frontière GCS gouvernée, mais strictement virtuelle. Les contrats MAVLink v2, STANAG 4586 et ROS 2 sont normalisés sous forme de télémétrie/enveloppes ; aucun transport UDP, série, WebHID, SDL, WebRTC, GStreamer ou ROS physique n’est ouvert par ce module.

La page `/gcs-simulation` fournit :

- réception de télémétrie fixture par API ;
- adaptateur WebSocket client vers `ws://127.0.0.1:8765` ;
- statut `BRIDGE CONNECTÉ · RÉCEPTION SEULE` ou `EN ATTENTE DE FLUX LOCAL` ;
- affichage des angles roll/pitch/yaw, position, vitesse, cap et qualité de liaison ;
- matrice GO1 à GO5 ;
- approbation humaine explicite ;
- certificat JSON `aeromind.gcs-command-preview.v1` pour une intention approuvée ;
- journal de gouvernance ;
- verrou d’arrêt d’urgence simulé.

## Contrat de sortie

Même lorsqu’une intention est approuvée en GO4/GO5 avec approbation humaine, le serveur renvoie un `command_preview` JSON avec `dry_run=true`, `transmitted=false` et `outgoing_frame=null`. L’adaptateur ne transmet pas le certificat ni l’intention au WebSocket. Cette limite est volontaire : une connexion localhost peut être reliée à un bridge matériel et ne constitue donc pas un canal de commande autorisé par ce livrable.

## Vérifications

- `pnpm check` : OK.
- `pnpm build` : OK.
- `PYTHONPATH=. .venv/bin/python -m pytest -q tests/test_gcs_api.py` : 4 tests OK.
- `py_compile` : `web/gcs_api.py`, `web/app.py`, `web/capability_policy.py` OK.

## Routes

- `GET /api/gcs/capabilities`
- `GET /api/gcs/state`
- `POST /api/gcs/telemetry/ingest`
- `POST /api/gcs/command/validate`
- `POST /api/gcs/emergency-stop`
- `POST /api/gcs/emergency-stop/reset`
- `GET /gcs-simulation`

## Limites

Ce Sprint ne fournit pas de commande aéronef, robot, datalink, HOTAS, radio, projecteur, caméra ou contrôleur réel. Pour un essai matériel, un environnement de qualification isolé, un simulateur certifié et une revue de sûreté indépendante sont nécessaires avant toute étude d’intégration supplémentaire.
