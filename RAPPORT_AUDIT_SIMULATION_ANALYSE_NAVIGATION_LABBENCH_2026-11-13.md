# Rapport d’audit — Simulation, Analyse, Navigation et LabBench 01

**Projet :** Aeromind.IA  
**Date :** 13 novembre 2026  
**Périmètre :** écrans Simulation & analyses, Centre aérodynamique/CFD, Mission Planner, Navigation satellite/GPS, écrans de simulation opérationnelle et effet sur LabBench 01.

## Conclusion

Les écrans audités sont raccordés à l’espace de travail Home et utilisent la configuration de cellule, le plan de mission et les résultats de simulation locaux. Les parcours cartographiques sont géoréférencés en WGS84, les cartes disposent de replis de fournisseurs et les parcours de démonstration restent explicitement virtuels.

Une anomalie de raccordement a été corrigée pendant l’audit : Home transmettait auparavant `userIntegratedThisSession={true}` à LabBench 01, même lorsqu’aucune cellule n’avait été intégrée pendant la session. Cela pouvait faire considérer une sélection restaurée comme une intégration courante. La prop utilise désormais l’état réel `cellIntegratedThisSession`.

Aucune modification n’a été apportée à l’arborescence indépendante d’Aeromind, au contrat de magnétisme, aux projections de rendu ou aux commandes de rotation précédemment intégrées.

## Vérifications fonctionnelles

### Simulation virtuelle

- `VirtualSimulationCenter` reçoit la configuration partagée Home et le résultat du moteur `runSimulation`.
- Les scénarios vent, altitude, météo, terrain, lieu et trajectoire modifient la configuration de simulation locale.
- Les waypoints sont affichés sur la carte, sélectionnables et éditables; les nouveaux points peuvent recevoir latitude/longitude WGS84, altitude et vitesse.
- La lecture de mission anime un drone virtuel sur la route; la fin de mission arrête la lecture et reste sans ordre physique.
- Les métriques affichées sont bloquées tant qu’une source de cellule suffisamment configurée n’est pas disponible.

### Analyse aérodynamique / CFD

- Le centre distingue correctement estimation analytique et CFD réelle.
- Les calculs disponibles sont explicitement marqués analytiques, théoriques ou non validés.
- Le solveur OpenFOAM, le maillage volumique, la convergence, les champs de pression et les lignes de courant restent bloqués lorsqu’aucun runtime CFD n’est raccordé.
- Les imports STL/OBJ/3MF inspectables restent locaux; les formats CAD reçus sans parseur vérifié ne sont pas présentés comme décodés.
- Les scénarios, historiques et rapports sont locaux et traçables; aucun calcul CFD fictif n’est déclaré.

### Navigation satellite / GPS

- La carte distingue le fond tactique et l’imagerie satellite.
- La chaîne de replis Esri → OSM → CARTO est présente; un endpoint local XYZ peut être fourni par configuration.
- Les entrées latitude/longitude vérifient les limites WGS84 et la limite d’affichage Web Mercator.
- Les points sont stockés localement par identité utilisateur et cellule.
- La télémétrie MAVLink est affichée en lecture seule; la vue n’envoie aucune commande, ne téléverse aucune trajectoire et ne produit aucun ciblage ou armement.
- La simulation d’inspection exige deux points, propose pause/reprise/fin et reste une chronologie visuelle synthétique.

### Mission Planner et effets sur LabBench 01

- Le Mission Planner travaille sur la configuration et le plan de mission partagés, sans créer une arborescence parallèle.
- Le plan de mission reste distinct des preuves LabBench; LabBench ne traite pas un brouillon local comme une preuve serveur.
- En mode local, LabBench accepte un calcul thermique synthétique borné, conserve les entrées et marque le résultat N2 local.
- En mode serveur, l’archivage dépend du projet authentifié et de la synchronisation prévue; aucune preuve locale n’est présentée comme preuve serveur.
- L’état de cellule intégrée est maintenant réellement piloté par l’action d’intégration de la session, et non forcé à `true` depuis Home.
- Le double contrôle et les gates existants restent inchangés.

## Validation automatisée

- Contrôle TypeScript et catalogues i18n : **OK**.
- Tests ciblés : **33 tests passés dans 7 fichiers**.
- Suite frontend complète avant cette correction : **474 tests passés dans 95 fichiers**.
- Build Vite de production après correction : **OK, code 0**.
- Avertissements non bloquants observés : script `/api/platform/config.js` non bundlé par Vite et quelques chunks volumineux; aucun échec de compilation.

## Limites déclarées

Les fonds cartographiques dépendent de services externes et de leur disponibilité. Le Centre aérodynamique ne constitue pas un solveur CFD tant qu’OpenFOAM ou un service équivalent n’est pas raccordé. Les données MAVLink affichées sont observées en lecture seule. Les simulations locales, métriques analytiques et trajectoires de démonstration ne constituent ni certification, ni autorisation de vol, ni preuve physique.
