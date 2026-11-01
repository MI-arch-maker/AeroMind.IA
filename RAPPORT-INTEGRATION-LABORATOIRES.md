# Livraison — intégration des laboratoires AeroMind

La tranche relie `Simulation & analyses`, `Essai & scénarios` et `Mission Control` à la même configuration de projet. Le scénario actif est maintenant porté par `ConceptConfig`, ce qui synchronise les cinq scénarios entre le laboratoire panoramique et le laboratoire spatial.

Le bouton **Lancer l’essai** applique le scénario sélectionné, ses conditions de vent et ses éventuels paramètres de retour, puis déclenche le recalcul global AeroMind avant de démarrer la lecture virtuelle. Mission Control déclenche également le recalcul lorsqu’une mission est démarrée.

Le vent latéral, la comparaison des résultats, la position initiale, le cap de référence et les options d’affichage sont écrits dans la configuration du projet existante et suivent donc la persistance locale/serveur déjà en place. Aucun accès matériel ou actionneur réel n’est ajouté.

## Validation

- `pnpm check` : réussi, catalogues i18n synchronisés et TypeScript sans erreur.
- `pnpm test` : 241 tests réussis dans 49 fichiers.
- `pnpm build:static` : réussi.
- Aperçu statique : HTTP 200 sur `/` et manifest `/manus-routes.json` accessible.

Les résultats restent des sorties de simulation synthétiques de niveau N2 et ne constituent ni une mesure physique, ni une qualification, ni une autorisation de vol.
