# Proposition — remplacement de la vue d’entrée Labbench

## Ce qui est remplacé

La vue actuelle affiche principalement l’absence de projet, l’état de session et une liaison serveur interrompue. Elle est correcte fonctionnellement, mais elle ne donne pas suffisamment de contexte opérationnel à un opérateur aéronautique.

## Nouvelle intention

Remplacer cette vue par une **passerelle opérationnelle Labbench** : même sans projet sélectionné, l’écran expose la situation générale, la disponibilité des systèmes et la prochaine action attendue.

## Composition proposée

- Bandeau de situation : projet actif, radar/satellite, flotte observable et contrôle physique.
- Point d’entrée opérateur : sélectionner un projet ou importer une cellule.
- Disponibilité des systèmes : identité, radar, télémétrie, commandes physiques.
- Six capacités ouvertes depuis la passerelle : radar/détection, satellite/navigation, mission/flotte, incidents en vol, commandes physiques et guidage distant.
- Événements récents et principes de lecture.

## Règles UX

- Ne pas présenter de fausse télémétrie quand aucun projet n’est sélectionné.
- Distingué clairement : disponible, attendu, contextuel, gated.
- Afficher l’action suivante plutôt qu’un état vide.
- Préserver les données et contrats Aeromind ; aucune logique organisationnelle supplémentaire.

## Prévisualisation

La maquette autonome est disponible dans `frontend/client/public/labbench-replacement-proposal.html`. Elle ne modifie pas la vue Labbench réelle et ne fait aucun appel API.

## Après approbation

L’intégration consistera à remplacer le rendu de la vue `projects`/`overview` lorsque le projet n’est pas sélectionné, en réutilisant les composants déjà présents pour la flotte, le radar, la carte, la mission, les incidents, le guidage et les commandes.
