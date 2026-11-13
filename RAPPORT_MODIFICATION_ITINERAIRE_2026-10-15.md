# AeroMind — personnalisation rapide d’itinéraire

## Modification livrée

Dans la sous-vue **Relief synthétique / Trajectoire supervisée** (`VirtualSimulationCenter`), la carte de trajectoire accepte désormais une personnalisation directe par clic.

- Le bouton **AJOUT RAPIDE** active le mode d’édition sur la carte.
- Un clic sur une zone vide de la carte crée un waypoint local `WP-XX`.
- Le waypoint est ajouté au plan de mission partagé et devient automatiquement actif.
- Les coordonnées locales, l’altitude cible et la vitesse de croisière sont initialisées automatiquement.
- Le panneau d’état confirme la position ajoutée et rappelle le mode actif.
- Le bouton **TRACÉ DÉMO** restaure la trajectoire synthétique par défaut.
- La sélection d’un waypoint existant reste disponible sans créer de doublon.

## Validation

- `pnpm check` : réussi
- `pnpm build` : réussi
- Prévisualisation HTTP temporaire : port 3000

Les données restent synthétiques et locales : aucune coordonnée réelle ni commande matérielle n’est générée.
