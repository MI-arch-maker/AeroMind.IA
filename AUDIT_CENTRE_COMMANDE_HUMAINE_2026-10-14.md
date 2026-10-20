# AeroMind — audit préalable du Centre de commande matérielle et de validation humaine

**Date :** 14 octobre 2026  
**Projet inspecté :** archive AeroMind-final-2026-10-14-human-activation.zip, extraite dans `/home/ubuntu/aeromind`  
**Périmètre :** inspection statique des sources, dépendances, contrats d’API et tests ; aucune commande physique, connexion matérielle ni modification applicative effectuée.  
**Décision de cette étape :** audit et proposition seulement, conformément au cahier des charges qui exige une approbation avant modification structurante ou connexion réelle.

## 1. Synthèse exécutive

La copie actuelle d’AeroMind est une application de conception/simulation avec des interfaces évoquant le pilotage, mais **elle ne fournit pas de chemin d’exécution matérielle fonctionnel**. Le contrat d’exploitation est N2 / simulation uniquement. Les capacités d’écriture, d’armement matériel et de téléversement de mission sont désactivées explicitement.

**Aucun équipement physique connecté ou pris en charge n’a pu être identifié dans l’archive.** Il n’y a ni pilote matériel livré, ni dépendance MAVLink/série/CAN, ni configuration de cible vérifiée. Une configuration de banc exportable côté navigateur mentionne série, CAN et Ethernet, mais elle est locale et déclarative ; elle n’établit pas une communication réelle.

La base de sécurité existante est utile : authentification OIDC, isolation de ressources par propriétaire, verrou de commandes côté serveur et frontière de commande côté frontend. Elle ne réalise toutefois pas encore le centre d’autorisation du cahier des charges : aucune demande matérielle persistante à approbation unitaire, aucun rôle opérateur/validateur, aucune approbation indépendante ni preuve de résultat physique vérifié.

**Recommandation :** conserver le verrou matériel fermé ; concevoir d’abord le centre complet en simulation/dry-run et tester les états, approbations, expirations et rejets. Toute activation ou connexion physique doit rester un projet ultérieur distinct, conditionné à une cible précisément identifiée, à ses spécifications, aux mesures de sûreté et à une autorisation explicite.

## 2. Architecture et équipements constatés

### 2.1 Architecture applicative

- **Frontend :** React 19 / TypeScript / Vite.
- **Backend :** FastAPI / Python, SQLAlchemy / Pydantic.
- **Données :** SQLite en développement ; PostgreSQL prévu en déploiement.
- **Identité :** cookie de session vérifié par le module OIDC ; identité à partir du sujet et de l’adresse validés.
- **Domaines existants :** projets, drones, simulations, rapports, LabBench, workflow versionné de prototypes et runs.
- **Flux de contrôle :** `web/hardware_api.py`, panneau React de contrôle, frontières de commande frontend, API SITL simulée.

### 2.2 Inventaire matériel réel dans l’archive

| Élément | Constat vérifiable | Conclusion |
|---|---|---|
| Autopilote / drone identifié | Aucun modèle, numéro de série, firmware, propriétaire matériel ou périphérique détecté | Aucune cible identifiée |
| Adaptateur MAVLink | `web/hardware_api.py` contient un import différé de `hardware.control_link.MAVLinkLink` si un chemin futur est activé | Le package `hardware/` n’est pas présent dans l’archive ; la dépendance `pymavlink` n’est pas dans `requirements.txt` |
| SITL | `sitl_modules/api.py` expose seulement des métadonnées de simulation | Pas de processus SITL externe ni de transport matériel ouvert par ce module |
| Série / CAN / Ethernet | L’UI `LabBenchHardwareConfig` stocke et exporte une fiche de configuration locale marquée `physicalOutputEnabled: false` | Pas de pilote ni de backend de communication correspondant |
| Télémétrie lecture seule | La frontière frontend sait valider une trame de télémétrie en entrée | Le flux n’est pas une preuve de connexion à un équipement réel |
| Arrêt d’urgence | Route logicielle simulée et texte invitant à conserver un arrêt physique indépendant | Aucun E-stop physique n’est intégré ni certifié |
| Capacités annoncées | `/api/capabilities` retourne `hardware_control: false`, `mission_upload: false`, `telemetry_write: false` | Les sorties matérielles sont explicitement indisponibles |

Une chaîne de configuration MAVLink et du code conditionnel de contrôleur ne suffisent pas à prouver la présence d’un adaptateur. La route `/api/control` refuse actuellement le mode matériel avant d’atteindre ce code.

### 2.3 Simulé, déclaratif et réellement exécuté

- **Simulé :** SITL exposant un statut fixe ; métriques de workflow `synthetic_demo` ; armement virtuel local borné à la simulation ; visualisations de vol.
- **Déclaratif uniquement :** formulaire de configuration de matériel LabBench et export JSON de cette configuration.
- **Bloqué :** armement physique, écriture actionneur, téléversement de mission et commandes de position/heading vers un aéronef.
- **Non démontré :** connexion, retour d’état matériel, intégrité de commande sur un bus et vérification d’un effet physique.

## 3. Authentification, rôles, audit et barrières

### 3.1 Authentification et autorisation

- La session OIDC est vérifiée côté serveur.
- Les projets et objets d’ingénierie sont généralement filtrés par propriétaire.
- Les rôles métier observés sont essentiellement `user` et `super_admin`, le second étant dérivé d’une liste d’adresses configurée.
- Aucun rôle `operator`, `human_validator` ou `observer` distinct n’est implémenté pour le contrôle matériel.
- Le panneau matériel a des confirmations d’interface, mais celles-ci ne constituent pas une autorisation serveur d’une commande précise. Le serveur demeure néanmoins fermé par le verrou `feature_enabled() == False`.

### 3.2 Barrières de commande

- `web/hardware_api.py::feature_enabled()` retourne toujours `False` ; la modification d’une variable d’environnement ne suffit donc pas à activer la commande.
- Les routes de mode matériel, d’armement et de commande appellent le refus serveur.
- La frontière `aircraftControlBoundary.ts` rejette `arm`, `actuator-write` et `mission-upload` pour tous les transports ; plusieurs tests unitaires couvrent ces refus.
- `sitl_modules/api.py` déclare explicitement qu’il n’ouvre pas MAVLink et n’émet pas d’actionneurs.

### 3.3 Journalisation

- Une table `HardwareLog` existe et des callbacks de journalisation sont prévus dans le code conditionnel du contrôleur.
- Comme le contrôleur n’est pas activable et que son package référencé est absent, aucun journal de cycle de vie d’approbation matérielle n’est actuellement démontré.
- Il n’existe pas de modèle séparé pour la demande préparée, son hash/version, les contrôles, l’approbateur, la décision, l’expiration, la transmission et la confirmation de résultat.
- La protection contre modification, rejeu et accès non autorisé aux journaux n’est pas établie par une chaîne d’audit dédiée.

## 4. Risques et écarts par rapport au cahier des charges

| Priorité | Écart / risque | État |
|---|---|---|
| P0 | Confusion possible entre UI de pilotage et commande réelle | Le backend et la documentation déclarent N2, mais certains libellés frontend suggèrent une capacité matérielle conditionnelle ; les modules de driver cités sont absents |
| P0 | Pas de workflow de consentement unitaire | Aucun cycle persistant préparer → afficher → vérifier → approuver/refuser → expirer → exécuter → vérifier |
| P0 | Pas de cible ou contrainte de sûreté propre au matériel | Aucune fiche technique ni règle par équipement n’est disponible |
| P0 | Pas de service matériel vérifiable | Pilotes, paquet `hardware/` et dépendances de liaison absents |
| P1 | Autorisations trop grossières pour la nouvelle fonction | OIDC et Super-Admin existent, mais pas de RBAC opérateur/validateur/observateur ni de validation à deux personnes |
| P1 | Idempotence, anti-rejeu, expiration et versionnement d’approbation absents | Le système ne les implémente pas pour des commandes physiques |
| P1 | Retours « transmis / accepté / effet vérifié » non séparés | Aucun accusé réel d’équipement dans le périmètre actuel |
| P1 | Journal d’audit incomplet | `HardwareLog` ne représente pas le cycle de demande et de consentement |
| P2 | Incohérence documentaire | Le README évoque des adaptateurs `MockAutopilot` et `MAVLinkLink`, mais ces fichiers ne sont pas présents dans l’archive inspectée |

## 5. Architecture d’intégration proposée

Cette section est une proposition ; elle n’autorise pas l’activation d’un lien physique.

```text
Interface Centre de commande
        │ prépare / affiche / sollicite une décision humaine
        ▼
API de demandes — demandes immuables, expirables, versionnées
        │
        ├── Contrôles de politique serveur et RBAC
        ├── Contrôles de préconditions / blocages / fraîcheur
        ├── Approbation explicite liée au hash exact de la demande
        ├── Seconde approbation indépendante pour niveaux de risque définis
        ├── Journal d’audit append-only, sans secrets
        ▼
Passerelle d’exécution — absente et désactivée dans la première phase
        │
        ▼
Adaptateur par équipement certifié/autorisé — absent dans cette archive
        │
        ▼
Retour distinct : transmis → accepté par interface → effet observé/vérifié
```

### 5.1 Modèle de demande à préparer

La demande devrait contenir, au minimum : identifiant unique, projet, équipement déclaré (identité et source de vérification), utilisateur demandeur, objectif, commande autorisée, paramètres normalisés, hash canonique, version de politique, risques, préconditions, résultats des contrôles, horodatages et expiration. Toute modification sensible crée une nouvelle version et invalide l’approbation antérieure.

### 5.2 États proposés

`prepared` → `pending_approval` → `approved` → `executing` → `completed_verified`.

États terminaux alternatifs : `rejected`, `cancelled`, `expired`, `blocked`, `failed`, `sent_unverified`, `interface_accepted_unverified`. Le système ne doit jamais transformer un accusé de transport en `completed_verified` sans observation indépendante correspondant au contrat de l’équipement.

### 5.3 Barrières proposées pour la première intégration

- Implémenter le cycle **uniquement sur transport simulé / dry-run**, sans driver et sans import de pilote physique.
- Fermer côté serveur toute transition d’exécution physique par défaut ; aucun flag client ne peut l’ouvrir.
- Rendre l’approbation spécifique à une demande, à son hash, à son équipement, à ses paramètres et à une durée courte définie par politique.
- Exiger une session authentifiée et une permission serveur pour chaque transition ; établir un RBAC explicite avant l’opérateur réel.
- Ajouter anti-rejeu (consommation atomique de l’autorisation, identifiant d’idempotence, état terminal) et contrôles de préconditions refaits immédiatement avant toute future exécution.
- Enregistrer décisions et résultats comme événements d’audit append-only ; ne pas y écrire de secrets.
- Faire de la perte de communication ou d’un retour ambigu un état non vérifié, jamais un succès.
- N’afficher aucune preuve d’arrêt physique ; préserver l’obligation d’un mécanisme indépendant validé par le fournisseur et l’ingénierie compétente.

## 6. Plan d’exécution par phases

### Phase A — audit (terminée)

Inventaire de la copie, séparation réel/simulé, lecture des barrières et tests déclarés, risques et architecture proposés. Aucun matériel contacté ; aucun code applicatif modifié.

### Phase B — centre en simulation uniquement (soumise à approbation)

Ajouter au système existant, sans remplacer ses modules, le modèle de demande et les états, l’API de préparation/approbation/refus/annulation/expiration, le journal d’audit, l’interface de présentation détaillée et un exécuteur simulé sans sortie réseau matérielle. Maintenir le refus de toute transition physique.

### Phase C — vérification adversariale en simulation (soumise à approbation)

Tester : utilisateur non autorisé, refus, approbation expirée, paramètres modifiés, équipement modifié, approbation rejouée, doubles clics/concurrence, demande annulée, contrôles insuffisants, perte/ambiguïté de retour, résultat incohérent et protection des données du journal. Ajouter tests API et UI.

### Phase D — banc isolé / matériel non dangereux (hors périmètre actuel)

Prérequis : équipement exact et documentation constructeur, environnement isolé, adaptateur audité, règles de sûreté spécifiques, mesure de l’arrêt indépendant, rôles nominatifs et autorisations de l’opérateur. La phase ne démarre pas automatiquement après les tests simulés.

### Phase E — service réel (hors périmètre actuel)

N’envisager qu’après revue indépendante, validation du propriétaire de l’équipement, conformité réglementaire applicable, essais en site contrôlé et autorisation explicite distincte. Aucun niveau de production ne peut être revendiqué par les tests de simulation.

## 7. Validation exécutée et limites

- Inspection statique du ZIP : archive CRC valide, aucun chemin d’extraction dangereux ni lien symbolique constaté lors de la vérification initiale.
- Code consulté : `web/hardware_api.py`, `web/app.py`, `web/config.py`, `web/models.py`, `sitl_modules/api.py`, `aircraftControlBoundary.ts` et ses tests, tests workflow et configuration des dépendances.
- Constat : `feature_enabled()` retourne toujours `False` ; capacités API déclarées matérielles à `false` ; pas de package `hardware/` dans l’arborescence ; `pymavlink` absent des dépendances.
- **Tests d’intégration non exécutés :** `pytest` n’est pas installé dans cet environnement (`pytest: command not found`). Le dépôt n’a pas été modifié pour installer des dépendances ni lancer un service.
- **Tests matériels :** non applicables et non exécutés ; aucun équipement ou lien n’a été sondé.
- Les tests unitaires présents sont des artefacts sources ; leur présence n’équivaut pas à une preuve de succès dans cet environnement.

## 8. Prérequis restant à fournir avant une éventuelle phase matérielle

1. Modèle exact d’équipement, autopilote, révision matérielle et version de firmware.
2. Documentation constructeur, protocole et modes sûrs applicables.
3. But précis de l’action et environnement d’essai contrôlé.
4. Identité des opérateurs/validateurs habilités et règle de séparation des tâches.
5. Description et preuve de validation de l’arrêt indépendant matériel.
6. Politique de retour d’état permettant de distinguer acceptation du protocole et effet physique observé.
7. Processus d’autorisation réglementaire et organisationnelle applicable.

## 9. Décision et approbation requise

Le cahier des charges demande expressément de présenter l’audit et la proposition avant toute modification structurante. **Aucune modification du code applicatif n’a donc été faite à cette étape.**

Décision recommandée : approuver seulement la **Phase B, centre de commande en simulation/dry-run, sans pilote, sans réseau matériel et avec exécution physique impossible**. La Phase D ou E ne doit pas être réputée approuvée par cette validation.

Pour poursuivre, préciser explicitement si la Phase B (simulation uniquement) est approuvée. Toute future proposition de connexion réelle devra être instruite séparément après réception des informations matériel/sûreté ci-dessus.


## 10. Résultat de la Phase B après approbation

L’utilisateur a approuvé explicitement la réalisation du centre **en simulation uniquement**. Cette phase a été implémentée dans la copie du projet :

- `web/command_center.py` : API de préparation, présentation, approbation, refus, annulation, expiration et exécution simulée ; les commandes sont une liste blanche `simulation-*`, les paramètres sont vides et aucun adaptateur/transport physique n’est importé.
- `CommandRequestRecord` et `CommandAuditEvent` : demandes versionnées par empreinte SHA-256 et journal chronologique sans endpoint de modification/suppression des événements.
- `HumanCommandCenter.tsx` et son CSS : nouveau panneau visible dans la navigation principale.
- `tests/test_command_center.py` : refus anonyme, refus des commandes physiques, cloisonnement propriétaire, transitions, expirations, altération après approbation, répétition et maintien du verrou matériel.
- `README.md` : capacité réelle et limites documentées.

**Validation obtenue :** 10 tests Python backend réussis (9 nouveaux + 1 workflow existant) ; 28 suites Vitest, 138 tests réussis ; vérification TypeScript réussie ; build frontend réussi. Le build conserve un avertissement existant de bundle initial > 500 kB. Aucun test n’a connecté ou sollicité un matériel.

La prévisualisation tourne sur une base SQLite temporaire, en environnement de développement et sans fournisseur OIDC configuré. L’interface est consultable, mais les actions API du centre requièrent une session OIDC et renvoient `401` en accès anonyme. Cette prévisualisation ne constitue ni une mise en production ni une autorisation matérielle. La route `/api/capabilities` conserve `hardware_control: false`, `mission_upload: false` et `telemetry_write: false`.
