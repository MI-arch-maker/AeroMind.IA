# AeroMind — itération 1 : observateur MAVLink en lecture seule

## Périmètre livré

Cette itération remplace l’absence de couche MAVLink active par un module isolé, `web/mavlink_observer.py`. Il ouvre explicitement un transport configuré par `AEROMIND_MAVLINK_URL` ou par défaut `udpin:0.0.0.0:14550`, puis consomme uniquement les trames déjà disponibles.

Le module détecte le système à partir de `HEARTBEAT`, conserve son identifiant, son type de véhicule, son autopilote et son état, puis extrait les informations de position, vol, batterie, GPS, état de geofence et les paramètres de sécurité reçus. Les paramètres filtrés couvrent notamment `ARMING_*`, `BRD_SAFETY*`, `COM_ARM*`, `FENCE_*`, `FS_*`, `GF_*` et `NAV_*`.

Le contrat public du module expose `read_only=True` et `hardware_commands_enabled=False`. Aucun appel `send`, aucune commande MAVLink, aucun changement de mode, armement, décollage, téléversement de mission ou écriture de paramètre n’est réalisé. Le transport n’est ouvert qu’après un appel explicite à `connect()` et peut être fermé avec `close()`.

## Compatibilité visée

MAVLink définit `HEARTBEAT` comme le mécanisme de découverte et d’identification des systèmes et composants. Le module suit ce mécanisme et considère la liaison active uniquement lorsqu’un heartbeat récent est reçu [1]. Les messages de position, état système, GPS, HUD, paramètres et `FENCE_STATUS` sont consommés sans dépendre d’un firmware propriétaire.

Le protocole MAVLink est utilisé par les véhicules et stations sol, indépendamment du transport sous-jacent. Cela permet de cibler ArduPilot et PX4 avec le même observateur, sans modifier leur firmware [2]. Les plans de mission, geofence et points sûrs sont bien des sous-protocoles MAVLink distincts ; leur lecture pourra constituer une itération suivante, sans activer ici leur téléversement [3].

QGroundControl peut rester connecté en parallèle. Pour éviter que deux clients se disputent un transport direct, le déploiement recommandé pour la suite est un `mavlink-router` ou une passerelle équivalente qui distribue les trames à QGroundControl et à AeroMind. QGroundControl utilise par défaut un system ID élevé et permet le forwarding MAVLink ; ces paramètres devront être alignés lors de l’intégration d’environnement [4].

## Plan de migration par modules

**Itération 1 — livrée :** observateur MAVLink lecture seule, parsing de heartbeat/télémétrie/geofence/paramètres de sécurité, dépendance `pymavlink`, tests avec transport simulé.

**Itération 2 — proposée :** exposition de l’état observé au backend AeroMind et à l’interface, avec statut explicite `NO_LINK`, `HEARTBEAT_STALE` ou `OBSERVING`. Aucun indicateur connecté ne devra être déduit de l’ouverture seule du socket.

**Itération 3 — proposée :** lecture contrôlée des plans standard via `MISSION_*`, en distinguant strictement mission, fence et rally. Cette étape restera lecture seule et devra vérifier les identifiants opaques de plan avant tout téléchargement [3].

**Itération 4 — non incluse :** workflow de commande. Elle ne pourra être étudiée qu’avec une confirmation humaine, une séparation de transport et une revue de sûreté dédiées. Elle est volontairement bloquée par la présente livraison.

## Validation

Les tests dédiés couvrent la découverte heartbeat, le parsing de position/batterie/geofence/paramètre de sécurité, l’absence de heartbeat immédiat après connexion, le rejet d’une limite de polling invalide et la fermeture du transport. La suite backend existante a également été relancée : **14 tests réussis**.

Aucune liaison à un autopilote réel n’a été ouverte pendant cette itération. La compatibilité ArduPilot/PX4 est donc une compatibilité de protocole et de parsing, pas une certification de véhicule, de firmware, de radio ou de navigabilité.

## Références

[1]: https://mavlink.io/en/services/heartbeat.html "MAVLink Heartbeat/Connection Protocol"
[2]: https://ardupilot.org/dev/docs/mavlink-basics.html "ArduPilot MAVLink Basics"
[3]: https://mavlink.io/en/services/mission.html "MAVLink Mission (Plan) Protocol"
[4]: https://docs.qgroundcontrol.com/master/en/qgc-user-guide/settings_view/telemetry.html "QGroundControl Telemetry Settings"
[5]: https://mavsdk.mavlink.io/v3/en/cpp/guide/telemetry.html "MAVSDK Telemetry Guide"
[6]: https://ardupilot.org/copter/docs/common-geofencing-landing-page.html "ArduPilot Fences and MAVLink status"
