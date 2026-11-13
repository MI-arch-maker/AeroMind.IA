# Proposition de design — Labbench Operational Command Room

## Statut

Proposition visuelle autonome, destinée à validation avant intégration. La surface est exposée dans `frontend/client/public/labbench-proposal.html` et ne remplace pas l’écran Labbench existant.

## Positionnement senior

Le nouveau Labbench doit être pensé comme un **banc de conduite multi-aéronefs et multi-systèmes**, comparable à une salle de conduite aéronautique/aérospatiale : plusieurs appareils peuvent appartenir à une même sortie, suivre des objectifs différents, partager des relais et être surveillés depuis une chronologie commune.

La proposition ne réduit donc pas Labbench à un tableau de suivi de cellule. Elle met en avant la conduite d’une flotte, la séparation, la disponibilité des liaisons, les incidents et les décisions opérateur tout en restant connectable aux surfaces Aeromind existantes.

## Architecture de surface proposée

### 1. Situation globale

Un bandeau de situation résume la mission active, la qualité des liaisons, la couverture radar, la disponibilité satellite, la disponibilité flotte et les alertes critiques.

### 2. Orchestration de flotte

Une mission groupée expose :

- l’identifiant et le rôle de chaque appareil ;
- l’état individuel : en route, attente, relais, retour, au sol ou indisponible ;
- l’énergie, la liaison primaire/secondaire et la fraîcheur du dernier état ;
- la relation entre objectifs de mission et appareils affectés ;
- la chronologie de flotte : départ séquencé, prise de secteur, relais, rassemblement et retour/clôture ;
- l’état de séparation de la mission et les écarts nécessitant l’attention de l’opérateur.

Cette vue doit permettre de distinguer immédiatement **l’état du groupe**, **l’état de chaque appareil** et **l’état de la liaison**, sans confondre une perte de télémétrie avec une perte de mission.

### 3. Systèmes opérationnels

Six surfaces restent accessibles depuis la même lecture :

- **Radar & détection** : pistes, zones, corrélation et couverture.
- **Satellite & navigation** : carte tactique, waypoints et qualité de liaison.
- **Opération en cours** : mission, flotte, télémétrie et chronologie.
- **Incidents en vol** : anomalies, priorités, résolution et replay.
- **Commandes physiques** : état d’autorisation, commandes disponibles et traçabilité.
- **Guidage distant** : route, consignes, relais opérateur et reprise de liaison.

### 4. Poste de décision

Les actions ne sont pas disséminées dans des panneaux indépendants. Chaque action expose son état, sa précondition, son niveau de criticité et la preuve de la décision associée. Pour une flotte, le contexte doit préciser si l’action vise un appareil, un sous-groupe ou toute la mission.

### 5. Centre de preuves et journal

Chaque événement important est présenté avec sa source, son horodatage, son acteur, son état et sa possibilité de revue. Les incidents en vol peuvent être suivis jusqu’à leur clôture et reliés aux traces de télémétrie, de mission, de liaison et d’appareil concerné.

## Principes de frontière

- Le nouveau design **ne remplace pas l’arborescence indépendante d’Aeromind**.
- Les gates, rôles, doubles contrôles et chaînes de décision existants restent ceux d’Aeromind.
- Aucun registre parallèle, arbitre supplémentaire ou gouvernance Manus n’est introduit.
- Les surfaces de commandes physiques reflètent l’état réel des contrats Aeromind ; elles ne l’ouvrent pas par simple présence visuelle.
- La maquette actuelle est purement visuelle : elle n’appelle aucune API et ne modifie aucune donnée.

## Direction visuelle

Une esthétique de *control room éditoriale* : fond graphite bleuté, cyan propriétaire pour les signaux et actions, vert pour les liaisons nominales, ambre pour les points à traiter et rouge réservé aux incidents critiques. La hiérarchie privilégie les états, les alertes, la chronologie et les verbes d’action plutôt que les décorations.

## Intégration ultérieure après approbation

1. Intégrer la hiérarchie visuelle au shell Home/LabBench existant.
2. Raccorder l’orchestration de flotte aux profils d’appareils et aux missions déjà portés par Aeromind.
3. Raccorder les cartes radar, satellite, flotte, incidents, guidage et commandes aux composants existants.
4. Réutiliser les contrats d’autorisation, d’audit, de simulation et de matériel déjà portés par Aeromind.
5. Valider séparément les actions appareil, sous-groupe et mission sans créer de nouvelle couche organisationnelle.
