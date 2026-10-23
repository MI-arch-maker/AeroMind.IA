

## Demande — intégration des laboratoires Simulation & analyses / Essai & scénarios

- [x] **Source unique projet :** le laboratoire panoramique, le laboratoire spatial et Mission Control lisent le même `ConceptConfig`, les exigences et le résultat du moteur AeroMind.
- [x] **Scénario actif partagé :** les cinq scénarios (stationnaire, trajectoire, vent latéral, obstacles, retour) sont sélectionnables depuis les laboratoires et leur sélection se reflète dans Mission Control, la télémétrie et les analyses.
- [x] **Lancer l’essai :** l’action applique la configuration du scénario sélectionné puis déclenche le recalcul global avant la lecture virtuelle.
- [x] **Paramètres projet :** le vent latéral, la comparaison de résultats, la position de départ, le cap de référence et les options d’affichage restent dans la configuration du projet et sont persistés avec le snapshot.
- [x] **Limites :** les laboratoires restent virtuels et synthétiques ; aucune commande physique, liaison d’actionneur ou preuve d’essai réel n’est ajoutée.
- [ ] **Validation finale :** typecheck, tests Vitest et build statique à exécuter sur l’archive modifiée.

## Demande — synchronisations et arborescence d’atelier (22 octobre 2026)

- [x] **État sincère :** ne pas présenter READY quand des modules sont `partial` ou `waiting`; refléter les liaisons incomplètes au niveau global.
- [x] **Arborescence logique :** rendre visible l’ordre Projet → Cellule/configuration → Exigences → Conception/version → Vérification → Rapports/audit, avec un état par branche.
- [x] **Audit des limites :** distinguer propagation locale/cross-tab, snapshot serveur, workflow immuable, LABBENCH et audit; documenter l’absence de conflit serveur compare-and-swap pour les sauvegardes concurrentes.
- [ ] **Synchronisation concurrente multi-poste :** introduire ultérieurement une révision serveur atomique et une politique explicite de conflit/fusion; la présente modification ne change aucun contrat de stockage partagé.

## Demande — LABBENCH 01 fonctionnel et mécanique strictement virtuelle (22 octobre 2026)

- [ ] **LABBENCH 01 :** corriger les erreurs d’affichage Web et compléter les contrats de statut, référentiel, simulation, rapports et audit ; rendre les écrans utilisables avec un projet local ou authentifié sans présenter un brouillon comme preuve serveur.
- [ ] **Fonctions mécaniques virtuelles :** débloquer diagnostic, consignes et armement simulés ; maintenir toutes les sorties physiques interdites, y compris en cas de variable matérielle activée.
- [ ] **Contrôle humain renforcé :** exiger des validations explicites distinctes avant une action virtuelle supervisée, borner les paramètres et permettre un arrêt immédiat qui annule les autorisations sans reprise automatique.
- [ ] **Préservation :** conserver l’identité visuelle, les projets, l’authentification, le Twin, les laboratoires de vol et la synchronisation existants ; vérifier les changements avec les suites TypeScript, Vitest et Python et livrer l’archive source corrigée.
