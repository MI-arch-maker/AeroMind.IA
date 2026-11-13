# Correctif — régression du Centre Mécanique

## Problème traité

La coque Mechanical Workbench avait remplacé l’accès principal à l’ancien Centre Mécanique. Les vues historiques — Vue système, atelier manuel, contraintes d’assemblage, nomenclature et installation, visserie, graissage, connecteurs et maintenance — n’étaient plus directement accessibles dans le parcours courant.

## Correction

Un onglet **Modules historiques** a été ajouté au Workbench. Il réaffiche le composant `MechanicalCenter` complet dans la zone centrale tout en réutilisant le `ConceptConfig` partagé. Les mises à jour continuent donc à se conserver dans les données du projet. Les vues Part Studio, Assembly, Filerie & Connectique, Maintenance et Construction & rapport restent disponibles.

La zone restaurée dispose de son propre défilement afin de préserver les dimensions de l’atelier et les panneaux latéraux. Aucun chemin de commande physique n’a été ajouté ou activé.

## Vérifications

- `pnpm exec tsc --noEmit` : réussi.
- `pnpm run build` : réussi. L’avertissement préexistant concernant les gros chunks JavaScript persiste.
- `pnpm exec vitest run client/src/lib/mechanicalCenterModel.test.ts` : 2 tests réussis.
