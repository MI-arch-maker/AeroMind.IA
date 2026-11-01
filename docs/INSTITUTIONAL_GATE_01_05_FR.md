# AeroMind — Chaîne institutionnelle GATE 01 à GATE 05

## Portée

La chaîne institutionnelle s’applique aux demandes de **commande virtuelle** et à leur examen organisationnel dans AeroMind. Elle préserve les commandes de simulation et les modules MAVLink existants, tout en séparant strictement :

- la validation institutionnelle d’une demande ;
- l’exécution contrôlée dans le simulateur ;
- toute sortie physique, qui demeure indisponible dans cette livraison.

Aucune action de cette chaîne n’émet une trame MAVLink, n’ouvre un transport, ne crée un jeton matériel, ne certifie la sécurité et ne vaut autorisation réglementaire ou de vol.

## Rôles explicites

| Étape | Rôle exclusif | Permission applicative |
| --- | --- | --- |
| Soumission / simulation | `operator` ou `analyst` habilité | `institutional.request.create` + `institutional.simulation.execute` |
| GATE 01 | `gate_01_reviewer` | `institutional.gate.01.validate` |
| GATE 02 | `gate_02_reviewer` | `institutional.gate.02.validate` |
| GATE 03 | `gate_03_reviewer` | `institutional.gate.03.validate` |
| GATE 04 | `gate_04_reviewer` | `institutional.gate.04.validate` + `institutional.transmission.issue` |
| GATE 05 | `super_admin` | `institutional.transmission.verify` + `institutional.gate.05.decide` |

Le rôle historique `approver` reste limité aux revues matérielles déjà présentes. Il ne remplace aucune responsabilité de GATE 01–04 et ne peut pas décider GATE 05.

## Parcours

1. Un utilisateur habilité soumet une demande virtuelle, dont l’intention et les paramètres sont hachés.
2. Les responsables GATE 01, GATE 02, GATE 03 puis GATE 04 valident ou refusent dans cet ordre. Une étape est refusée si son rôle ou sa position est incorrecte.
3. Après GATE 04, AeroMind crée un code de transmission lié à l’identifiant et à l’empreinte de la demande, signé par la clé de session du runtime. Seule son empreinte est persistée.
4. Le Super-Administrateur reçoit le code par le canal institutionnel retenu, vérifie l’origine, l’authenticité et l’historique via l’API, puis approuve ou refuse personnellement GATE 05.
5. Chaque soumission, validation, refus, émission/vérification de transmission, décision GATE 05 et exécution simulée est append-only dans `institutional_gate_events`.

## Simulation et sortie physique

La simulation ne dépend pas de GATE 05 : un utilisateur habilité peut exécuter une demande virtuelle et l’événement est tracé. Une décision GATE 05 approuvée conserve les indicateurs suivants à `false` :

- `physicalOutputEnabled`
- `physicalAuthorizationGranted`
- `safetyCertificationGranted`
- `regulatoryAuthorizationGranted`

La frontière matérielle existante conserve ses propres contrôles : verrou `AEROMIND_VIRTUAL_ONLY`, règles `HARDWARE_CONTROL`, liste blanche MAVLink, jeton signé à usage unique, cloisonnement projet/propriétaire et géofence fail-closed.
