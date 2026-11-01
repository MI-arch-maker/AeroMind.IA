# AeroMind — points critiques pour une validation en laboratoire

**Statut : aide à la préparation uniquement.** Ce document n’est ni une évaluation de conformité, ni une approbation d’exploitation, ni une certification EASA. La Preview et le poste de vol demeurent virtuels : aucune liaison ou sortie vers un aéronef n’est activée. La liste ne doit jamais être utilisée comme autorisation de vol.

## 1. Applicabilité réglementaire avant tout protocole de test

- [ ] Confirmer le pays d’exploitation, l’autorité nationale compétente, l’opérateur responsable et la version des règles en vigueur au moment du test.
- [ ] Décrire l’opération envisagée (lieu, trajectoire, personnes exposées, environnement, masse/classe de l’UAS, visibilité, contrôle, communication) et confirmer la catégorie réglementaire. Ne pas présumer que le laboratoire, le simulateur ou un test HIL détermine la catégorie d’une opération ultérieure.
- [ ] Vérifier si une opération ouverte, un scénario standard (STS), une évaluation pré-définie de risque (PDRA) ou une autorisation de catégorie spécifique est applicable; faire confirmer le choix par l’opérateur/l’autorité plutôt que par l’interface AeroMind.
- [ ] Si une SORA est requise, documenter la méthode EASA applicable, les étapes de l’analyse, les risques au sol et dans l’espace aérien, les mitigations, le SAIL, les OSO applicables, les exigences opérationnelles/techniques et les éléments de preuve attendus. Définir les limites de la zone opérationnelle et de la zone adjacente ainsi que les hypothèses de confinement.
- [ ] Relier chaque objectif de sécurité aux dangers, à la mesure de réduction du risque, au responsable, au test de laboratoire et à la preuve archivée. Toute condition non étayée reste « non démontrée », jamais « validée ».

## 2. Configuration et conditions de laboratoire

- [ ] Consigner les identifiants/version exacts de l’aéronef, autopilote, firmware, paramètres, passerelle, application AeroMind et dépendances; stocker l’empreinte des configurations et fichiers de mission testés.
- [ ] Définir les rôles : responsable du test, pilote/observateur quand nécessaire, sécurité du banc, responsable du logiciel, critère d’arrêt et chaîne d’escalade.
- [ ] Pour cette livraison, confirmer le mode logiciel VIRTUAL/SIMULATION; maintenir la sortie matérielle fermée. Commencer par une simulation (SITL/HIL sous protocole de laboratoire approuvé); les essais bancs alimentés et les essais en vol sont des phases distinctes, non autorisées par ce document.
- [ ] Si une phase HIL est ultérieurement autorisée : isoler le banc, retirer/hors-tensionner les hélices ou actionneurs selon le protocole, vérifier l’arrêt d’urgence physique de l’installation, identifier tous les câbles/radios et empêcher tout routage IP/série vers un aéronef en service.
- [ ] Confirmer la géofence : référentiel, unités, altitude de référence, limites, altitude max, marge, zone adjacente et comportement si aucune géofence n’existe, si elle est périmée ou si la position est absente/ancienne. L’absence de géofence bloque le test de commande concerné.
- [ ] Consigner l’état attendu des failsafes, de la perte de liaison, du retour/atterrissage, du GNSS et de la batterie à partir de la documentation du firmware exact. Les choix et délais sont spécifiques au système et doivent être revus par le responsable compétent.

## 3. Protocole logiciel et tests de sûreté prioritaires

| Priorité | Point à surveiller | Preuve attendue / condition de refus |
|---|---|---|
| P0 | Authentification, rôle, propriétaire, projet et aéronef | Toute absence ou discordance est rejetée avant accès au transport; journal d’audit associé au bon acteur/projet. |
| P0 | Jeton d’autorisation à usage unique | Jeton lié à l’acteur, au projet, à l’aéronef, à la commande et au hash de paramètres; signature fournie vérifiée; expiré, consommé, rejoué ou modifié = refus. Consommation unique même en cas de concurrence. |
| P0 | Révisions et actions virtuelles | Identifiant d’action neuf, révision attendue correcte et réponse serveur acquittée; doublon, requête concurrente ou état périmé ne produit pas de « succès » UI. |
| P0 | Réseau/transport fermé | En SIMULATION/VIRTUAL, confirmer par preuve automatisée qu’aucune route n’ouvre un port matériel, n’appelle un pilote ou n’émet un message MAVLink; chaque endpoint matériel retourne un refus lorsque la capacité est désactivée. |
| P0 | Geofence et données de position | Tester les bords, l’intérieur, l’extérieur, unités et positions manquantes/périmées; en cas d’ambiguïté, position invalide ou géofence absente, aucun upload/ordre n’est préparé pour transmission. |
| P0 | Mission et séquence MAVLink (si activée dans un banc futur) | Waypoints/commandes autorisés validés avant le démarrage; séquence MISSION_COUNT → MISSION_REQUEST[_INT] → MISSION_ITEM[_INT] → MISSION_ACK vérifiée; refus, timeout, ACK manquant ou ACK rejeté = échec, sans afficher « uploadé ». |
| P0 | Résultat de commande et télémétrie | Distinguer prêt, autorisé, transmis, ACK autopilote, effet observé et résultat inconnu; « envoyé » ne signifie pas « accepté » ni « effectué ». Pas de nouvelle transmission automatique après résultat ambigu. |
| P1 | Perte ou retard de liaison | Tester coupures, pertes, réponses tardives, reconnexion, doublons et décalage d’horloge; aucune reprise implicite ni ordre ancien rejoué. |
| P1 | Failsafes (firmware/configuration identifiés) | Vérifier la réaction attendue à RC/GCS, télémétrie, batterie, GNSS et geofence au simulateur; confronter résultat au manuel versionné et au plan d’urgence. Ne pas généraliser un résultat PX4 à ArduPilot, ni l’inverse. |
| P1 | Urgence et sémantique | Distinguer arrêt du scénario virtuel, demande de NAV_LAND, RTL et terminaison/coupure moteur. Une demande de `NAV_LAND` ne doit jamais être décrite comme un « emergency stop » qui coupe les moteurs. Tester le ciblage propriétaire/projet/aéronef et le refus d’une requête non ciblée. |
| P1 | Observabilité, audit et données | Pour chaque essai, archiver version, conditions initiales, acteur, identifiant, révision, séquence, événements, ACK/erreur, horodatage, télémétrie et résultat; vérifier l’isolation interprojets et l’accès minimal. |
| P2 | Revue post-essai | Reproduire anomalies sans transport réel, attribuer criticité, conserver les données, documenter actions correctives et faire approuver une nouvelle version de protocole avant progression. |

## 4. Critères d’arrêt et progression

Arrêter immédiatement le scénario de test en présence d’un ordre inattendu, d’un statut trompeur, d’un ACK absent ou contradictoire, d’une position/geofence douteuse, d’une isolation manquante, d’un accès non autorisé, d’une action rejouée ou d’une perte de confinement. Ne pas réessayer automatiquement une commande ambiguë. Bloquer la phase suivante tant que l’anomalie n’a pas une cause, un correctif, une preuve de non-régression et une approbation indépendante documentés.

Toute progression du simulateur vers un banc réel, puis éventuellement un essai en vol, nécessite une revue distincte des dangers, de l’équipement, de la compétence, de la procédure d’urgence et de l’autorisation réglementaire applicable. Le Centre de commande AeroMind ne fournit pas ces autorisations.

## 5. Références officielles à revalider à la date de l’opération

- EASA, [Easy Access Rules for Unmanned Aircraft Systems](https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-unmanned-aircraft-systems).
- EASA, [Specific Operations Risk Assessment (SORA)](https://www.easa.europa.eu/en/domains/drones-air-mobility/operating-drone/specific-category-civil-drones/specific-operations-risk-assessment-sora).
- MAVLink, [Message Signing](https://mavlink.io/en/guide/message_signing.html) et [Mission Protocol](https://mavlink.io/en/services/mission.html).
- PX4, [Safety Configuration](https://docs.px4.io/main/en/config/safety) et [MAVLink Security Hardening](https://docs.px4.io/main/en/mavlink/security_hardening).

Ces références sont des sources techniques/réglementaires à lire dans leur version actuelle; leur présence dans AeroMind ne démontre aucune conformité de ce projet ni aucune approbation de l’exploitation.