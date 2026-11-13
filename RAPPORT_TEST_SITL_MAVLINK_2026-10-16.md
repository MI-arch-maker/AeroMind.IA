# AeroMind — rapport de test SITL MAVLink read-only

## Résultat de cette itération

Le module `web/mavlink_observer.py` expose maintenant des statuts de liaison explicites : `DISCONNECTED`, `CONNECTING`, `WAITING_HEARTBEAT`, `OBSERVING`, `HEARTBEAT_STALE`, `RECONNECTING`, `ERROR` et `RECONNECT_EXHAUSTED`.

La reconnexion est passive : elle ferme puis rouvre le transport local configuré après le délai `AEROMIND_MAVLINK_RECONNECT_INTERVAL_S`. Elle ne transmet aucun heartbeat, aucune demande de paramètre et aucune commande. Le nombre de tentatives peut être limité par `max_reconnect_attempts`.

Un endpoint `GET /api/telemetry/mavlink/status` projette l’état courant au frontend. Il exécute seulement `poll()` et renvoie position, batterie, mode custom heartbeat, statut geofence, timestamps et statut de liaison. Le nouvel écran intégré dans « Navigation satellite » indique clairement `READ_ONLY`.

## Installation hors sandbox

### ArduPilot SITL

```bash
git clone https://github.com/ArduPilot/ardupilot.git ~/ardupilot
cd ~/ardupilot
Tools/environment_install/install-prereqs-ubuntu.sh -y
./waf configure --board sitl
./waf copter
```

Redémarrer le shell après l’installation si les variables d’environnement ArduPilot le demandent. Le script AeroMind attend par défaut `~/ardupilot`; personnaliser avec `ARDUPILOT_ROOT=/chemin/ardupilot`.

### mavlink-router

Installer `mavlink-routerd` depuis le paquet de la distribution ou depuis le dépôt officiel `mavlink-router`. Vérifier :

```bash
mavlink-routerd --help
```

QGroundControl doit être configuré pour écouter le port UDP `14550`. AeroMind écoutera le port `14551`.

## Lancement du banc

Terminal 1 — ArduPilot :

```bash
cd aeromind
./scripts/sitl/start_ardupilot_sitl.sh
```

Le script demande à SITL d’émettre vers `127.0.0.1:14600`.

Terminal 2 — routeur :

```bash
cd aeromind
./scripts/sitl/start_mavlink_router.sh
```

Le routeur distribue les trames à `127.0.0.1:14550` pour QGroundControl et `127.0.0.1:14551` pour AeroMind.

Terminal 3 — contrôle passif AeroMind :

```bash
cd aeromind
PYTHONPATH=. ./scripts/sitl/check_passive_observer.py --url udpin:127.0.0.1:14551 --seconds 30
```

Résultat attendu : des lignes `OBSERVING`, `connected: True`, des timestamps heartbeat et des compteurs de messages croissants, puis `PASSIF_OK`. QGroundControl peut rester ouvert sur `14550` pendant toute la vérification.

## Scénario « observateur passif muet »

Le banc est conçu pour que QGroundControl et AeroMind reçoivent les mêmes trames issues du routeur. AeroMind n’utilise aucun appel `send`, ne demande aucune donnée au véhicule et ne modifie aucun paramètre. Le script de contrôle n’exige que la réception de `HEARTBEAT` et `SYS_STATUS`; il termine en erreur si le flux n’est pas reçu.

Pour documenter le caractère muet au niveau réseau, capturer uniquement les paquets émis par le processus AeroMind dans un environnement de test, ou utiliser les compteurs du routeur. L’acceptation fonctionnelle est : QGC reste connecté, AeroMind reçoit les trames, et aucune trame MAVLink sortante de commande n’est produite par `MavlinkObserver`.

## Scénario de perte de lien

Arrêter le processus routeur ou SITL après une phase `OBSERVING`. Après `heartbeat_timeout_s` (5 secondes par défaut), l’observateur passe à `HEARTBEAT_STALE`, puis tente une reconnexion selon `AEROMIND_MAVLINK_RECONNECT_INTERVAL_S` (5 secondes par défaut). En cas d’échec persistant, `ERROR` est exposé; avec une limite d’essais, le statut final est `RECONNECT_EXHAUSTED`.

Le frontend rafraîchit `/api/telemetry/mavlink/status` toutes les deux secondes et affiche l’état, le dernier heartbeat et la dernière trame. Des données anciennes ne sont pas présentées comme fraîches : le statut de liaison reste visible.

## Vérifications exécutées dans cette itération

- tests unitaires de parsing existants ;
- test de perte de heartbeat et reconnexion bornée avec transport simulé ;
- contrôle syntaxique Python ;
- contrôle TypeScript, tests Vitest et build frontend ;
- vérification que le chemin d’observation ne comporte aucune émission MAVLink.

Le test ArduPilot SITL réel nécessite l’installation locale d’ArduPilot et de `mavlink-routerd`; ces binaires ne sont pas présents dans le sandbox de livraison. Les scripts reproductibles et la procédure ci-dessus sont inclus dans `scripts/sitl/`.

## Garde-fous non négociables

`read_only=True` reste forcé. `hardware_commands_enabled=False` reste forcé. Aucun module de commande, d’armement, de mission ou d’écriture de paramètre n’est appelé par l’observateur, l’API ou l’écran de télémétrie.
