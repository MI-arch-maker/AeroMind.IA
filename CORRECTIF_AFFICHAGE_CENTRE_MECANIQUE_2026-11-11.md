# Correctif d’affichage — Centre Mécanique

## Diagnostic

La feuille `frontend/client/src/components/mechanical-workbench.css` ne contenait que quelques ajustements de grille et de panneau, sans le socle de styles du Mechanical Workbench. Le composant JSX possédait pourtant des classes structurelles (`mwb-menubar`, `mwb-toolbar`, `mwb-main`, `mwb-tree`, `mwb-center`, `mwb-inspector`, etc.). Conséquence visible : les contrôles se collaient, la mise en colonnes ne s’appliquait pas et la vue paraissait sans mise en forme, contrairement aux panneaux AeroMind.

## Correction

La feuille de styles complète a été reconstruite : identité sombre AeroMind et accent cyan; en-tête et barre d’outils; grille principale à trois zones (arbre, viewport, inspecteur); panneaux d’onglets, propriétés, historique et diagnostics; styles des formulaires; règles de conteneur responsive pour tablettes et petits écrans. Les modules historiques restent dans l’onglet prévu. Aucun comportement métier, donnée ou contrôle matériel n’a été modifié.

## Vérification

- `pnpm exec tsc --noEmit` : réussi.
- `pnpm run build` : réussi (l’avertissement existant sur les gros chunks reste présent).
- Contrôle Chromium à 1600 × 1000 : le Workbench réapparaît avec ses panneaux et sa grille, dans la palette AeroMind.

Le message OIDC/Entra mentionné séparément est un sujet d’authentification indépendant et n’est pas modifié par ce correctif d’affichage.
