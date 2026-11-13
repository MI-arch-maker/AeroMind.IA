# Modernisation AeroMind — Centre de protection

## Périmètre livré

Le Centre de protection ajoute une surface dédiée à `/security-center` sans remplacer l’arborescence ICX POWER SOLUTIONS SRL / AeroMind. Il regroupe quatre sondes non destructives : résilience anti-bug, intégrité applicative, signaux d’accès anormal et disponibilité/brouillage de l’API.

Le module exécute une sonde `GET /api/ready`, affiche un état nominal ou à surveiller, conserve un journal d’événements local au rendu et exporte un rapport JSON horodaté. Une indisponibilité ne produit pas de faux succès : l’état passe en surveillance et reste non destructif.

## Séparation d’autorité

Le module ne modifie ni les rôles, ni les centres, ni les contrôles humains, ni la chaîne G01–G05. Il n’active aucun matériel, n’ouvre aucun transport MAVLink et reste compatible avec `HARDWARE_CONTROL=false`, `AEROMIND_VIRTUAL_ONLY=true` et `physicalOutputEnabled=false` dans la Preview.

## Limites explicites

Le terme « antivirus » désigne ici une sonde d’intégrité applicative. Cette fonctionnalité ne remplace pas un antivirus hôte, un EDR, un WAF, un pare-feu, une analyse de fichiers entrants ou une réponse à incident. La protection d’infrastructure et la qualification des alertes restent sous la responsabilité de l’Entreprise et de ses procédures.

## Démonstration

- Route : `/security-center`
- Action « Relancer les sondes » : revalide la disponibilité API sans commande externe
- Action « Exporter le rapport » : produit `aeromind-rapport-protection.json`
- États : `NOMINAL`, `SURVEILLANCE`, `BLOQUÉ` lorsque l’extension future le nécessitera
