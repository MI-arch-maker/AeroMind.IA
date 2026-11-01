# Plan d’intégration matérielle et de sécurité — AeroMind

**Version :** 1.0 — 1 novembre 2026  
**Périmètre de cette livraison :** plan uniquement. Aucun code, paramètre de contrôle, secret ou service matériel n’a été modifié. Aucune connexion ni commande vers un aéronef n’a été activée. Pendant l’inspection, l’API de démonstration annonçait `hardware_control=false`.

## Objectif et limite actuelle

Le but est de définir les étapes préalables à une éventuelle intégration contrôlée d’un contrôleur de vol. Ce plan n’est ni une autorisation de vol, ni une certification, ni une instruction de mise sous tension. Il ne présume ni du type d’aéronef, ni du firmware, ni du pays d’exploitation.

Le panneau principal « Poste de commande de vol » met à jour un scénario local et affiche explicitement qu’il n’envoie pas d’ordre à un aéronef (`frontend/client/src/pages/Home.tsx:9699–9807, 11250–11257`). Le Centre de commande humaine exécute lui aussi une démonstration avec accusé synthétique (`web/command_center.py:365–389`). Ces fonctions ne doivent pas être présentées comme un poste de pilotage réel.

L’intégration physique est une voie distincte, présente dans le backend, mais l’audit a relevé des défauts bloquants. Le plan maintient donc le matériel désactivé jusqu’à l’achèvement et l’approbation de toutes les portes ci-dessous.

## Défauts qui déterminent l’ordre des travaux

1. **État VIRTUAL différent de l’interface.** Le contrôleur serveur exige `action_id` et `expected_revision` pour l’armement et chaque consigne (`web/virtual_control.py:88–103, 146–197`). Le panneau envoie ces champs lors de l’activation, mais pas dans ses appels d’armement et de consigne (`frontend/client/src/components/HardwareControlPanel.tsx:270–324`). Ces parcours doivent rester distincts du pilotage matériel et être corrigés/testés comme fonctions virtuelles.

2. **Consommation du jeton matériel doublée.** La route consomme le jeton, puis appelle le pilote (`web/app.py:1813–1829`). Le contrôle du pilote le consomme à nouveau (`web/mavlink_command_api.py:401–410` puis `:184–188`), alors que le stockage refuse un jeton déjà consommé (`web/hardware_gate.py:480–541`). Le parcours ne doit jamais produire une trame avant une autorisation atomique et unique.

3. **Validation de mission qui n’est pas fail-closed.** Le code vérifie les points dans une geofence seulement si un polygone existe; sans geofence, cette partie est ignorée (`web/mission_planner.py:323–343`). Avant tout futur upload, absence, invalidité, ancienneté ou propriété incorrecte de la geofence doit conduire à un refus avant le premier message de protocole.

4. **Portée et identité de l’arrêt vocal.** La route vocale appelle l’arrêt global sans transmettre de propriétaire ou de projet (`web/voice_commands.py:220–239`; `web/geofence_validator.py:350–382`). Le plan exige un filtrage par identité, projet et aéronef. En outre, le chemin nommé e-stop envoie `NAV_LAND`; il n’équivaut pas à une coupure moteurs ou à une terminaison de vol (`web/mavlink_command_api.py:478–540`). Le terme et la fonction devront être définis avec le constructeur et le responsable de sécurité.

5. **Envoi confondu avec résultat.** Le pilote marque la commande comme acceptée quand l’appel local d’envoi ne lève pas d’exception (`web/mavlink_command_api.py:439–476`); il n’attend pas un `COMMAND_ACK` ni une confirmation de l’état véhicule. L’interface doit distinguer au minimum « autorisée », « transmise », « acceptée par le contrôleur », « effet observé » et « résultat inconnu ».

## Plan séquencé et portes de sortie

### Étape 0 — Verrouiller le périmètre

Documenter le concept d’opération : pays/autorité compétente, environnement, catégorie réglementaire, VLOS/BVLOS, zone, public exposé, rôle du télépilote et conditions d’exploitation. Identifier l’aéronef exact, le type (multirotor, aile fixe, VTOL), le contrôleur, le firmware, la version MAVLink/dialecte, la liaison, les capteurs et les fonctions déjà configurées dans le contrôleur.

Établir une matrice approuvée des commandes avec les préconditions, états autorisés, paramètres et unités, limites, accusés requis, comportement en perte de liaison et méthode de reprise. Ne pas déduire qu’un même `MAV_CMD` a un effet sûr ou identique sur tous les firmwares. Si l’exploitation a lieu dans l’UE, l’analyse réglementaire doit se baser sur les versions applicables des règlements UAS et de leurs AMC/GM; EASA publie les Easy Access Rules et indique la révision consolidée consultée dans sa bibliothèque. La catégorie « spécifique » peut nécessiter une évaluation du risque opérationnel et des mesures de mitigation, notamment selon SORA lorsque l’opération n’est pas couverte par STS ou PDRA [1] [2].

**Porte 0 :** aucun développement d’émission réelle tant que le véhicule, le firmware, le scénario, la juridiction et les commandes permises ne sont pas nommés et approuvés par les responsables concernés.

### Étape 1 — Conserver une séparation dure entre démonstration et matériel

Garder SIMULATION/VIRTUAL comme mode initial. Garder `HARDWARE_CONTROL` désactivé par défaut dans tous les environnements non qualifiés. Le service virtuel doit rester sans import ni accès au pilote physique. Le poste principal doit continuer à afficher clairement ses commandes simulées, et ne jamais réutiliser le libellé « armé », « retour » ou « atterrissage » sans indiquer le mode et la preuve associée.

Pour une future voie physique, séparer explicitement capacités, API, autorisations, file d’exécution et télémétrie de la voie simulée. Toute activation éventuelle doit exiger un environnement matériel explicitement provisionné et approuvé; une variable front-end ou une simple valeur d’environnement ne doit pas suffire. L’état matériel observé doit être visible dans l’interface et l’audit. Prévoir un mécanisme de fermeture de la voie matérielle qui n’interrompt pas la simulation.

**Porte 1 :** tests négatifs démontrant qu’une session SIMULATION/VIRTUAL, une panne de service ou une configuration incomplète ne peut appeler aucun pilote, port série, socket véhicule ou émetteur MAVLink.

### Étape 2 — Rendre le contrôle virtuel cohérent avant toute voie physique

Compléter les appels de l’interface VIRTUAL avec un `action_id` neuf et la révision serveur courante sur l’armement et les consignes; invalider toute confirmation dès qu’un champ change. N’appliquer l’état local qu’après une réponse valide du serveur. Traiter les réponses périmées, doublons, 401/403, 409 et pannes réseau comme des états distincts, jamais comme un succès.

Le mode local non enregistré doit rester visuellement et fonctionnellement distinct du jumeau virtuel serveur. Les tests doivent couvrir l’activation, l’armement, position, cap, arrêt, réponse retardée, double clic, rejet de révision, rejeu d’identifiant et bascule hors ligne.

**Porte 2 :** chaque action VIRTUAL annoncée comme réussie produit une réponse serveur correspondante et un reçu `virtual-only`; aucune réponse ne prétend à un effet physique.

### Étape 3 — Refaire l’autorisation matériel comme transaction unique

Formaliser un flux serveur unique : identité OIDC vérifiée → autorisation de rôle et de projet → lien propriétaire/projet/aéronef → revue indépendante → demande immuable → jeton de courte durée → consommation atomique unique → validation de paramètres → émission → suivi du résultat. Le serveur doit imposer la commande et les paramètres pré-approuvés; il ne doit pas faire confiance à l’acteur, au projet, au drone, aux valeurs ou à un statut fournis uniquement par le client.

Lier le jeton à l’acteur, au projet, au drone, à la commande exacte, au hash des paramètres canoniques, à l’approbateur distinct, à l’expiration et à un identifiant de demande immuable. Conserver une seule fonction de consommation atomique, avec résultat d’audit, et éliminer toute deuxième consommation dans le même parcours. Une erreur ou une réponse ambiguë après émission ne doit pas réautoriser automatiquement le rejeu; toute reprise exige une politique idempotente, une vérification d’état véhicule et, si nécessaire, une nouvelle approbation.

Appliquer l’isolation propriétaire/projet à l’enregistrement, à la lecture, au pool, au pilote, aux zones, aux missions, à l’arrêt d’urgence et aux audits. Refuser toute discordance avant l’ouverture ou l’utilisation d’un transport.

**Porte 3 :** suite de tests couvrant acteur/projet/drone/paramètres erronés, expiration, rejeu, concurrence, double approbateur, révocation, perte d’audit et réutilisation inter-tenant; toute anomalie doit échouer avant une trame sortante.

### Étape 4 — Sûreté géographique et sémantique de chaque commande

Valider une geofence persistée, attribuée au bon projet, fraîche et géométriquement valide. Refuser une opération en l’absence de zone requise, de position véhicule fraîche ou de données nécessaires; ne pas considérer des coordonnées envoyées par le navigateur comme position actuelle. Contrôler tous les points d’une mission, les altitudes, les unités, la référence verticale, le repère, la trajectoire entre points et les enveloppes définies par l’exploitation. Les sorties invalides, NaN/infini, valeurs hors plage et polygones dégénérés doivent être rejetés.

Construire une fiche de commande par véhicule/firmware : préconditions de mode et d’armement, estimation positionnelle, disponibilité des capteurs, batterie, état home, limites opérationnelles, réponse attendue et conduite à tenir si l’état est inconnu. Pour l’upload de mission, l’ancien plan doit rester intact jusqu’à l’acceptation du nouveau plan; vérifier protocole complet, `MISSION_ACK` d’acceptation, identifiant/hash du plan et lecture de vérification lorsque la pile le permet. Le protocole MAVLink définit l’échange `MISSION_COUNT`, requêtes d’éléments, `MISSION_ITEM_INT` puis `MISSION_ACK`; les timeouts/réessais et erreurs doivent ramener l’opération à un état explicite sans faux succès [6].

**Porte 4 :** aucune émission de commande de navigation ni upload de mission sans geofence valide, position/télémétrie de fraîcheur définie, contexte véhicule confirmé et validation de chaque paramètre.

### Étape 5 — Reconcevoir accusés, télémétrie et urgence

Modéliser séparément autorisation, transmission, ACK MAVLink, changement d’état télémétrique et résultat observé. L’ACK doit être corrélé au système/composant attendu, à la commande et à sa fenêtre temporelle. Une absence d’ACK produit « résultat inconnu/à vérifier », pas « réussi »; ne jamais répéter automatiquement une commande de vol potentiellement déjà exécutée.

Concevoir l’urgence avec le pilote et le constructeur par type d’aéronef : distinguer maintien, RTL, atterrissage, désarmement et terminaison. Éviter le terme « arrêt d’urgence » pour une demande `NAV_LAND` seule. L’urgence doit être liée au bon propriétaire/projet/aéronef, disposer d’un parcours et d’un audit dédiés, et rendre visible si l’ordre a été transmis puis confirmé. Les actions correctes dépendent du véhicule et des conditions; PX4, par exemple, distingue Hold, Return, Land, Disarm et Flight Termination et documente des interactions entre failsafes [5]. Ne pas transposer ces comportements à une autre pile sans validation.

**Porte 5 :** chaque commande affiche son mode, son destinataire, sa source, son statut de preuve et son résultat non ambigu; l’urgence dispose d’un scénario analysé et testé hors vol.

### Étape 6 — Sécuriser les liaisons et les secrets

Inventorier toutes les interfaces série, UDP/TCP, relais radio et passerelles; restreindre les destinations par liste d’autorisation et éviter toute exposition MAVLink à des réseaux non approuvés. Les secrets ne doivent figurer ni dans les logs, ni dans les réponses HTTP, ni dans le dépôt. Prévoir rotation, révocation, sauvegarde contrôlée et procédure de compromission.

MAVLink 2 signing authentifie les messages et offre une protection contre le rejeu via son timestamp; il ne chiffre pas le trafic. La clé doit être partagée par canal sûr, conservée en secret et les messages non signés doivent être refusés selon une politique stricte. La documentation PX4 recommande aussi de sécuriser le lien réseau (par exemple VPN/radio avec chiffrement authentifié), de ne pas exposer les ports MAVLink et de segmenter le réseau [3] [4]. Le choix final devra être validé pour l’autopilote et la liaison AeroMind réellement retenus.

**Porte 6 :** revue de menace terminée; canaux, ports, clés et droits d’accès inventoriés; tests de rejeu, d’usurpation, de perte de lien et d’exposition réseau passés.

### Étape 7 — Vérifier en simulation puis sur banc contrôlé

Étendre d’abord les tests unitaires et API avec doubles déterministes; ils ne doivent pas dépendre d’un port série ou d’un véhicule. Ajouter les tests d’intégration SITL sur le firmware/version convenus, y compris absence de GPS, perte de liaison, batterie critique, ACK négatif, messages hors ordre, geofence absente, mission modifiée et demande concurrente. Tester séparément chaque type d’aéronef et chaque firmware supporté.

Ensuite seulement, un responsable d’essais distinct peut proposer une qualification sur banc contrôlé, avec procédure écrite, zone dédiée, rôles, critères d’arrêt et revue de risques. Tout essai de vol ultérieur nécessite une autorisation distincte, opérateur/télépilote compétent, enveloppe d’essai et mesures d’atténuation conformes à l’autorité compétente. Dans l’UE, EASA décrit SORA comme une méthode d’évaluation de l’opération spécifique, de ses risques et mesures d’atténuation; elle ne remplace pas l’autorisation applicable [2].

**Porte 7 :** revue indépendante et dossier de preuves signé par ingénierie, sécurité, exploitation et responsable réglementaire. Sans ce dossier, rester en SIMULATION/VIRTUAL avec `HARDWARE_CONTROL=false`.

## Critères de décision avant toute future mise en service

Ne considérer aucun périmètre réel comme opérationnel tant que le véhicule, le firmware et les fonctions supportés ne sont pas limités et documentés; que les défauts P0 de jeton, geofence et isolation sont clos; que la signification des ACK et états UI est testée; que les essais unitaires, API, SITL et banc approuvés sont traçables; et que le responsable d’exploitation dispose d’une procédure de repli. Un « test réussi » avec `FakeAutopilot`, une API HTTP répondant 200 ou un envoi local sans exception ne prouve pas qu’un autopilote a accepté et exécuté une commande.

Avant de transformer ce plan en spécification exécutable, il faudra fournir au minimum le pays d’exploitation, le modèle/type d’aéronef, l’autopilote et son firmware, le transport MAVLink, la liste exacte des commandes souhaitées, l’usage prévu (y compris VLOS/BVLOS) et les responsables d’exploitation/sécurité. Sans ces données, conserver le plan au niveau générique.

## Références

[1]: https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-unmanned-aircraft-systems "Easy Access Rules for Unmanned Aircraft Systems, EASA"
[2]: https://www.easa.europa.eu/en/domains/drones-air-mobility/operating-drone/specific-category-civil-drones/specific-operations-risk-assessment-sora "Specific Operations Risk Assessment, EASA"
[3]: https://mavlink.io/en/guide/message_signing.html "Message Signing, MAVLink Developer Guide"
[4]: https://docs.px4.io/main/en/mavlink/security_hardening "MAVLink Security Hardening for Production Deployments, PX4"
[5]: https://docs.px4.io/main/en/config/safety "Safety Failsafe Configuration, PX4"
[6]: https://mavlink.io/en/services/mission.html "Mission Protocol, MAVLink Developer Guide"
