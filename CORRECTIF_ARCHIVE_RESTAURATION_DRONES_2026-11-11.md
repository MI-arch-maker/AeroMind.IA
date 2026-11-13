# Correctif — archive et restauration de la flotte de drones

## Parcours Super-Admin

Dans **Projets**, le bouton **Archive drones** télécharge une archive JSON AeroMind avant toute suppression. Le bouton **Supprimer** télécharge lui aussi l’archive, puis exige une confirmation distincte avant de lancer l’effacement définitif. Pour restaurer, utiliser **Restaurer depuis une archive** et confirmer le projet et le nombre de drones annoncés.

## Contenu et contrôles

L’archive versionnée `aeromind-restoration-archive` contient l’identité et les métadonnées du projet, son drone actif, les identifiants/noms/configurations des drones, et une empreinte SHA-256 de contrôle d’intégrité. Le serveur accepte export et import uniquement avec une session Super-Admin. La restauration refuse les archives altérées ou mal formées, les collisions de projet/drone et un propriétaire d’origine absent; elle n’écrase jamais un projet existant. Les décisions d’export et de restauration sont journalisées sans inclure le contenu de la flotte dans l’événement d’audit.

La restauration recrée **le projet et ses configurations de drones**. Les missions, runs, rapports, sessions, télémétrie, validations et journaux supprimés ne font pas partie de ce format et ne sont pas restaurés. L’empreinte SHA-256 aide à détecter une altération accidentelle, mais n’est pas une signature d’authenticité. Conserver l’archive dans un emplacement protégé.

## Vérifications

- TypeScript frontend : réussi.
- Build frontend : réussi, avertissement préexistant de chunks volumineux.
- Python : compilation syntaxique et import des routes réussis; `pytest` : 3 tests d’archive réussis; test d’intégration SQLite export → suppression → restauration réussi.
- Frontend : build production réussi; l’avertissement préexistant sur les gros chunks demeure.
