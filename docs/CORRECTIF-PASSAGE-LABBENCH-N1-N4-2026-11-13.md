# Correctif du parcours LabBench N1→N4 — 13 novembre 2026

## Cause constatée

L’interface confondait la disponibilité d’un projet AeroMind authentifié avec l’intégration d’une cellule drone dans le workspace. Sur une surface LabBench intégrée, les requêtes projet, l’affichage du formulaire TOTP et la vue persistante pouvaient donc rester bloqués tant qu’une cellule n’avait pas été intégrée. Cette dépendance est inutile pour les premières étapes qui s’exécutent sur l’émulateur logiciel.

Une seconde lacune empêchait N1 de s’initialiser explicitement : l’API `seedRegistry` existait, mais l’interface ne l’appelait pas. Une archive N2 pouvait créer le registre indirectement, rendant l’ordre d’usage déroutant.

## Correctif

- La sélection d’un projet authentifié active les requêtes de projet LabBench sans exiger au préalable l’intégration d’une cellule. L’intégration de cellule reste une donnée distincte pour les opérations qui en dépendent.
- La restauration de la session LABBENCH est conservée si la lecture/synchronisation de la cellule échoue; cette information ne peut plus annuler l’authentification projet/TOTP.
- Après activation de la session LabBench par le step-up TOTP, l’interface vérifie l’existence du registre et appelle l’endpoint officiel `seedRegistry` une seule fois par projet lorsque N1 manque. Le registre et l’état des gates sont ensuite relus depuis AeroMind.
- Après l’archivage N2, le client relit également le registre, puisque l’API de persistance du run peut l’initialiser.
- Les préconditions existantes sont conservées : run N2 archivé; checklist N3-READY; double confirmation pour l’armement N3; revue indépendante N4. Aucun nouvel arbitre organisationnel ou registre parallèle n’est introduit.
- Toutes les opérations restent dans le périmètre Preview/simulation; aucune sortie ou commande matérielle n’est activée.

## Parcours attendu

1. Se connecter à AeroMind, sélectionner le projet LabBench et activer LABBENCH avec le TOTP.
2. Vérifier le registre N1 initialisé automatiquement pour le projet.
3. Exécuter puis archiver un scénario N2.
4. Compléter la checklist N3-READY simulée, puis réaliser l’armement N3 selon le double contrôle existant.
5. Faire enregistrer la revue indépendante N4.

## Vérifications

- Frontend : typecheck, build et 472 tests réussis.
- Backend : 30 tests ciblés réussis, 10 ignorés par leur propre configuration.
- Preview : API ready en mode `simulation`, accueil, manifeste de routes et URL publique répondent `200`.
