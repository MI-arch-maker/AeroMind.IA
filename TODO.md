

## Demande — intégration des laboratoires Simulation & analyses / Essai & scénarios

- [x] **Source unique projet :** le laboratoire panoramique, le laboratoire spatial et Mission Control lisent le même `ConceptConfig`, les exigences et le résultat du moteur AeroMind.
- [x] **Scénario actif partagé :** les cinq scénarios (stationnaire, trajectoire, vent latéral, obstacles, retour) sont sélectionnables depuis les laboratoires et leur sélection se reflète dans Mission Control, la télémétrie et les analyses.
- [x] **Lancer l’essai :** l’action applique la configuration du scénario sélectionné puis déclenche le recalcul global avant la lecture virtuelle.
- [x] **Paramètres projet :** le vent latéral, la comparaison de résultats, la position de départ, le cap de référence et les options d’affichage restent dans la configuration du projet et sont persistés avec le snapshot.
- [x] **Limites :** les laboratoires restent virtuels et synthétiques ; aucune commande physique, liaison d’actionneur ou preuve d’essai réel n’est ajoutée.
- [ ] **Validation finale :** typecheck, tests Vitest et build statique à exécuter sur l’archive modifiée.
