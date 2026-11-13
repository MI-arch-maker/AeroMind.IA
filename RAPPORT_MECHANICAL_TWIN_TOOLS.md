# AeroMind Mechanical Twin — livraison rapide

**Date :** 16 octobre 2026  
**Périmètre :** projet fourni dans `AeroMind-Mechanical-Twin-Operational-Interfaces.zip`.

## Fonctionnalités présentes dans le projet

L’atelier n’était pas une simple maquette : il comprend déjà modèle mécanique paramétrique Three.js, sélection et inspection des pièces, transformations (position/rotation/échelle), ajout de volumes et supports personnalisés, congé sur modules cubiques, symétrie miroir, vues orthographiques, rendus solide/filaire/X-ray, coupes X-ray, isolement et opacité par groupe, préréglages X-ray, explosion, calques avec visibilité/couleur/opacité/verrouillage, annotations de revue, historique local de versions, comparaison/restauration, brouillons locaux, capture, revue des indices du maillage, simulation indicative et exports OBJ/JSON.

## Ajout livré

- Ajout de `exportMechanicalSTL(model)` : export STL ASCII triangulé des seules pièces visibles, appliquant les transformations de chaque pièce, avec repères explicites d’unités métriques (mètres).
- L’action de navigation **Fabrication** déclenche le téléchargement `.stl` et rappelle le statut conceptuel/non qualifié.
- Test unitaire couvrant la génération triangulée, l’absence de valeurs NaN, les unités et l’exclusion d’une pièce masquée.
- README complété avec l’usage et les précautions de fabrication.

## Vérifications effectuées

- Installation frontend déterministe : `pnpm install --frozen-lockfile` — réussie.
- `pnpm run check` — réussi (catalogues de traduction et TypeScript).
- `pnpm exec vitest run client/src/lib/mechanicalTwinGeometry.test.ts` — 10 tests réussis.
- `pnpm test -- --run` — 41 fichiers de tests réussis.
- `pnpm run build` — réussi.

## Limites à connaître

Le build Vite émet un avertissement de taille : bundle principal d’environ 4,34 Mo minifié (1,23 Mo gzip). L’archive documente également des limites full-stack préexistantes : la preview statique ne démontre pas l’API, l’authentification SSO ni la persistance serveur. Le STL exporté est un maillage de conception conceptuelle; il ne constitue ni une preuve de maillage imprimable/étanche, ni un plan de production certifié, ni une analyse de contraintes. Les commandes matérielles restent désactivées.
