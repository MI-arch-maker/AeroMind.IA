# Livraison — Contrôle VIRTUAL fonctionnel LABBENCH 01

## Corrections livrées

- Reconstruction de la vue `Contrôle VIRTUAL — supervision humaine` en console opérateur.
- Confirmations d’activation et d’armement séparées en cartes indépendantes.
- Grille de setpoints dédiée : X local, Y local, altitude et cap ne peuvent plus s’entremêler.
- Confirmation de commande séparée du formulaire de valeurs.
- Barre d’actions regroupée et responsive : activation, armement, simulation, arrêt d’urgence, application position et application cap.
- États, reçus et messages de session isolés dans une section dédiée.
- Corrections responsive pour écrans intermédiaires et mobiles.
- Bascule automatique vers la simulation locale fonctionnelle lorsque le service authentifié n’est pas disponible ; aucune action ne reste silencieusement inactive.
- Les handlers existants sont conservés : activation, armement, application de position, application de cap et arrêt d’urgence.
- Le périmètre matériel reste strictement refusé : le contrôle concerne uniquement le jumeau logiciel VIRTUAL.

## Tests

- Contrôles VIRTUAL frontend : 21 tests réussis.
- Tests LABBENCH backend ciblés : réussis.
- Contrat handlers/layout : OK.
- TypeScript/i18n : OK.
- Build Vite : OK.
- `py_compile` virtual control/hardware API : OK.
- `/api/ready` : HTTP 200.
- `/labbench` : HTTP 200.
