# AeroMind — contrat du workflow intégré

## Objectif

Le prototype vertical relie les modules selon le flux :

```text
Atelier → version immuable → simulation → hall d’essais → résultat → rapport → atelier
```

Le workflow est **N2 / simulation uniquement**. Les résultats actuels sont des métriques déterministes de démonstration et portent `evidence_level: synthetic_demo` ainsi que `physical_solver_connected: false`.

## Identité et immutabilité

- `project_id` : projet propriétaire SQL.
- `prototype_id` : identifiant stable pour le nom du prototype dans un projet.
- `prototype_version_id` (`id`) : identifiant unique de la configuration enregistrée.
- `version` : semver immuable, par exemple `1.0.0`.
- `input_sha256` : hash du contrat configuration + exigences + croquis.
- Une nouvelle écriture du même `project_id + prototype_id + version` est refusée en `409`.
- Une évolution doit créer une nouvelle version (`1.0.1`, `1.1.0`, etc.) ; elle ne modifie jamais l’ancienne ligne.

## Contrat de configuration commun

Toutes les interfaces de calcul utilisent les unités SI suivantes :

| Champ | Unité |
| --- | --- |
| `wingspan_m`, `chord_m`, `fuselage_length_m` | m |
| `propeller_diameter_m` | m |
| `battery_wh` | Wh |
| `payload_kg`, `max_takeoff_mass_kg` | kg |
| `cruise_speed_mps`, `wind_speed_mps` | m/s |
| `altitude_m` | m |
| `motor_count` | entier |

Le cockpit convertit explicitement les valeurs historiques en km/h vers m/s avant transfert.

## Contrat scénario

- `scenario_id`, `name` : identité fonctionnelle.
- `coordinate_frame` : `ENU` ou `NED`.
- `altitude_unit` : exclusivement `m`.
- `speed_unit` : exclusivement `m/s`.
- `waypoints[]` : `x_m`, `y_m`, `z_m`, `speed_mps`.
- `seed` : permet de rejouer les mêmes entrées déterministes.

Toute unité non supportée ou tout point hors plage est rejeté avant création du run avec une erreur de validation explicite.

## Interfaces HTTP

### Enregistrer une version

```http
POST /api/workflow/prototypes
```

Réponse `201` : version `ready_to_simulate`, hash des entrées et moteur de référence.

Erreurs :

- `401` : session OIDC manquante ou invalide ;
- `404` : projet inexistant ou non possédé ;
- `409` : version immuable déjà existante ;
- `422` : unités, champs ou paramètres incompatibles.

### Exécuter un scénario

```http
POST /api/workflow/prototypes/{prototype_version_id}/runs
```

La transition est `running → completed` ou `running → failed`. L’exécution actuelle est un calcul de distance/durée déterministe de démonstration ; elle ne prétend pas être un calcul aérodynamique.

### Relire un run

```http
GET /api/workflow/runs/{run_id}
```

### Rejouer exactement les mêmes entrées

```http
POST /api/workflow/runs/{run_id}/replay
```

Le nouveau run conserve `replay_of`, le même scénario et doit produire le même résultat pour un même moteur.

### Générer un rapport

```http
POST /api/workflow/runs/{run_id}/report
```

Seul un run `completed` peut produire un rapport. Le rapport contient la version immuable, la configuration, le scénario, le résultat, le moteur et le niveau de preuve.

## États

| État | Signification |
| --- | --- |
| `draft` | état UI avant enregistrement |
| `ready_to_simulate` | prototype validé et immuable |
| `running` | run créé, exécution en cours |
| `completed` | résultat disponible et rejouable |
| `failed` | exécution interrompue avec erreur explicite |

## Retour arrière

- Les modifications sont isolées dans `web/workflow.py`, `web/models.py`, le client `integratedWorkflow.ts`, le panneau Home, la feuille CSS et les tests.
- L’ancienne logique de simulation et les anciennes routes restent intactes.
- Pour retirer le prototype vertical, il suffit de retirer l’import/include `workflow_router`, les deux nouveaux modèles et le panneau `IntegratedWorkflowPanel`; aucun ancien projet ou run n’est réécrit.
- Avant migration de production, une migration SQL versionnée doit remplacer le `create_all` de développement.

## Niveau de preuve

Le frontend et le backend affichent et stockent explicitement :

```json
{
  "evidence_level": "synthetic_demo",
  "physical_solver_connected": false,
  "hardware_control": false
}
```

Le branchement d’un moteur physique futur devra introduire une nouvelle version de moteur, ses entrées/sorties archivées et des tests de référence avant de modifier ce niveau de preuve.


## EngineeringDocument v1 — Studio et Poste de construction

Le workflow partagé accepte désormais un document d’ingénierie normalisé, en unités SI :

- `component_instances` : composants identifiés de façon stable, catégorie, masse, position, échelle et niveau de preuve ;
- `connections` : relations mécaniques, puissance, contrôle, données ou montage ;
- `validation` : anomalies et données manquantes explicitement classées ;
- `bom` : lignes de nomenclature avec statut `verified`, `partial`, `estimate` ou `missing` ;
- `geometry` et `parameters` : valeurs paramétriques communes au Studio, au Poste, au Centre et au Hall.

Le document est lié à une `PrototypeVersion` immuable. Un second enregistrement pour la même version est rejeté en `409`. Les références de connexions vers des composants inexistants sont ajoutées comme erreurs de validation ; elles ne sont pas présentées comme vérifiées.

Endpoints :

- `POST /api/engineering-documents/prototype-versions/{prototype_version_id}`
- `GET /api/engineering-documents/prototype-versions/{prototype_version_id}`

Ce contrat ne constitue pas un solveur physique ni une CAO industrielle. Toute masse estimée, compatibilité non vérifiée ou donnée absente reste signalée dans le document.
