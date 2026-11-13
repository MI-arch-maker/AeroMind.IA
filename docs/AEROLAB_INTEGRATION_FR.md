# AeroLab — laboratoire d’essais virtuel

## Emplacement

Le panneau **Laboratoire d’essais virtuel** est placé en tête de **Simulation & analyses**. Il précède la salle d’essais panoramique `VirtualFlightTestHall` et le centre `VirtualSimulationCenter`, qui restent en place.

## Utilisation

Le laboratoire reprend à l’ouverture le profil de drone, la masse calculée, la charge utile, la batterie, la vitesse, les conditions de mission, le plan de mission local et l’estimation énergétique courante du modèle AeroMind. Tant que le banc est au repos et suit le profil du projet, une modification du profil actif est reprise automatiquement. Si ce profil change pendant une séquence, l’essai conserve son instantané; un avertissement propose la resynchronisation après l’essai ou la réinitialisation. Le bouton **Resynchroniser le drone actif** relit aussi le profil présent dans le projet sur demande. Les éditions faites dans le banc sont locales au laboratoire : elles ne changent pas `ConceptConfig`, ne sont pas enregistrées dans le projet et ne déclenchent pas le moteur serveur.

Les scénarios prédéfinis couvrent l’inspection d’infrastructures, la cartographie civile et une recherche-sauvetage simulée. L’opérateur peut ajuster les conditions, la charge embarquée et les seuils d’acceptation, puis lancer, suspendre, reprendre ou réinitialiser une séquence locale. Le rapport JSON n’est exportable qu’après la fin de la séquence; l’impression est limitée au panneau.

## Limites et sécurité

Toutes les valeurs affichées dans le laboratoire sont des valeurs calculées ou synthétiques. Le modèle est déterministe mais conceptuel et non étalonné sur un aéronef réel. Le score de stabilité de départ est une hypothèse éditable; la puissance de départ est dérivée et normalisée à partir de l’estimation AeroMind. La télémétrie n’est pas une mesure physique.

Aucun drone, capteur, actionneur, plan de vol opérationnel, réseau de commande ou interface matérielle n’est relié au laboratoire. Une issue **PASS** concerne uniquement les critères déclarés dans ce modèle; elle ne vaut ni validation physique, ni homologation, ni certification, ni autorisation de vol.

## Vérifications effectuées

- Contrôle TypeScript et synchronisation des catalogues : `pnpm check`.
- Tests du projet : `pnpm test` (251 tests réussis lors de l’intégration).
- Compilation du frontend : `pnpm build:static`.
- Les fichiers AeroLab ne produisent pas de candidat au linter i18n. Le linter global continue de signaler des chaînes historiques dans d’autres composants existants; elles ne sont pas modifiées par cette intégration.
