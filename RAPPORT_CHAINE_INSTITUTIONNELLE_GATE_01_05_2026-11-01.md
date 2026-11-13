# Rapport de livraison — Chaîne institutionnelle AeroMind GATE 01 à GATE 05

**Date :** 1 novembre 2026
**Périmètre :** commandes virtuelles et simulation AeroMind uniquement
**Statut :** livré, vérifié en environnement `VIRTUAL_ONLY`

## Résumé exécutif

AeroMind représente désormais explicitement la chaîne suivante : **utilisateur habilité → GATE 01 → GATE 02 → GATE 03 → GATE 04 → code de transmission → Super-Administrateur → GATE 05**.

Cette chaîne ne remplace pas la frontière matérielle. Les commandes virtuelles, l’adaptateur de simulation et le code MAVLink existant sont préservés. La simulation reste disponible pour les rôles habilités sans être artificiellement dépendante de GATE 05. En revanche, aucune décision institutionnelle, y compris GATE 05 approuvée, ne crée un jeton matériel, une émission MAVLink, une certification de sécurité ou une autorisation réglementaire.

## Modifications livrées

### 1. Modèle institutionnel persistant

Les tables suivantes sont ajoutées dans `web/models.py`, avec une migration SQL dédiée :

- `institutional_command_requests` : demande virtuelle, empreinte d’intention, statut de progression, empreinte/signature de transmission et décision GATE 05 ;
- `institutional_gate_events` : journal append-only des soumissions, validations, refus, émission/vérification de transmission, décision GATE 05 et exécutions simulées.

La migration est disponible dans `migrations/2026-11-01_institutional_gate_chain.sql`. Elle doit être appliquée par le processus de migration usuel avant un déploiement de production où la création automatique de schéma est désactivée.

### 2. RBAC explicite et responsabilités séparées

La matrice `web/labbench_auth.py` comprend désormais les rôles distincts suivants :

| Responsabilité | Rôle / permission |
| --- | --- |
| Demande virtuelle / simulation | `operator` ou `analyst` avec `institutional.request.create` et `institutional.simulation.execute` |
| GATE 01 | `gate_01_reviewer` / `institutional.gate.01.validate` |
| GATE 02 | `gate_02_reviewer` / `institutional.gate.02.validate` |
| GATE 03 | `gate_03_reviewer` / `institutional.gate.03.validate` |
| GATE 04 | `gate_04_reviewer` / `institutional.gate.04.validate`, `institutional.transmission.issue` |
| GATE 05 | `super_admin` / `institutional.transmission.verify`, `institutional.gate.05.decide` |

Le rôle existant `approver` n’est pas promu en approbateur générique : il n’a pas la permission GATE 05 et ne peut pas se substituer aux responsables GATE 01–04.

### 3. Transmission et décision GATE 05

Le nouveau service `web/institutional_gates.py` applique les règles suivantes :

1. GATE 01–04 sont strictement séquentielles et associées à un rôle nominatif.
2. Après GATE 04, un code de transmission `AM-TR-…` est généré, lié à la demande et signé HMAC avec la clé de session du runtime. Seule son empreinte est persistée.
3. Le Super-Administrateur doit vérifier le code, son authenticité et les validations antérieures avant la décision personnelle GATE 05.
4. GATE 05 peut approuver ou refuser, avec auteur, horodatage, justification et corrélation dans le journal institutionnel.
5. Le code de transmission ne constitue jamais à lui seul une autorisation automatique.

L’API protégée par session step-up est disponible sous `/api/institutional/*` : création, lecture, décisions GATE 01–04, vérification de transmission, décision GATE 05 et exécution simulée.

### 4. Simulation préservée, physique distinct

Le service institutionnel n’importe ni pilote MAVLink, ni pool de transport, ni socket, ni jeton matériel. Son exécution simulée produit un événement explicitement marqué :

- `simulationOnly: true`
- `physicalOutputEnabled: false`
- `physicalTransportInvoked: false`

Le runtime de prévisualisation a été lancé avec `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et `AEROMIND_SITL_AUTOSTART=false`. L’état HTTP observé confirme : `virtualOnly: true`, `physicalOutputEnabled: false`, `physicalCommandsEmitted: false`, `poolSize: 0`.

### 5. Interface utilisateur

Un panneau **« Chaîne institutionnelle · démonstration locale »** est intégré à l’adaptateur de simulation. Il permet de visualiser et tester :

- les rôles GATE 01 à GATE 04 ;
- le code de transmission et sa vérification par le Super-Administrateur ;
- la décision GATE 05 personnelle ;
- le journal d’événements ;
- une exécution de commande virtuelle qui reste disponible dans le simulateur.

Le panneau est volontairement étiqueté comme une démonstration locale. L’API serveur est le chemin persistant et authentifié. Dans les deux cas, la copie d’interface rappelle l’absence de sortie physique, de certification et d’autorisation réglementaire.

## Résultats de vérification

| Contrôle | Résultat |
| --- | --- |
| Tests Python du service GATE 01–05 | **4 réussis** |
| Tests de protections matérielles, avec doubles de connexion uniquement | **49 réussis** |
| Tests Vitest frontend, y compris le parcours institutionnel | **76 fichiers, 365 tests réussis** |
| Vérification TypeScript | **réussie** |
| Synchronisation des catalogues i18n | **réussie — 2 617 clés** |
| Build Vite | **réussi** |
| API institutionnelle sans session | **401 attendue : session LABBENCH step-up requise** |
| Matrice RBAC des rôles institutionnels | **vérifiée** |
| Statut de prévisualisation | **`/api/health` : `ok`, base connectée** |
| Statut physique de prévisualisation | **virtuel uniquement, aucune émission** |
| En-têtes de prévisualisation | **sans `X-Frame-Options` ni `frame-ancestors` bloquant l’iframe Preview** |

## Limites et actions de déploiement

- Cette livraison n’autorise aucune sortie physique. Toute reprise matérielle éventuelle exige ses mécanismes indépendants déjà présents : verrou runtime, autorisation humaine séparée, jeton matériel signé, allowlist, géofence fail-closed et autres obligations de sûreté/réglementaires.
- GATE 05 est une décision institutionnelle uniquement. Elle ne doit pas être présentée comme une homologation, une certification, une autorisation de vol ou un feu vert réglementaire.
- Pour la production, appliquer la migration institutionnelle, attribuer les rôles explicites via l’IAM de l’organisation et acheminer le code de transmission au Super-Administrateur via le canal institutionnel choisi.

## Livrables

- Service et API institutionnels ;
- modèles, migration et tests ;
- interface de simulation GATE 01–05 ;
- guide fonctionnel : `docs/INSTITUTIONAL_GATE_01_05_FR.md` ;
- archive source finale, sans `.venv`, `node_modules`, bases locales, journaux, secrets ni build généré.
