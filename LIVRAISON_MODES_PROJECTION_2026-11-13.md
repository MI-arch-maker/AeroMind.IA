# Livraison — modes de projection AeroMind

## Périmètre

Cette livraison modernise les aperçus paramétriques utilisés par les centres Parametric, Mécanique, Twin et Studio IDDS sans modifier l’arborescence organisationnelle AeroMind, les contrôles métier ni les commandes matérielles.

## Fonctionnalités ajoutées

- Le mode **Vectoriel** reste le mode par défaut et le mode de secours historique.
- Le même maillage paramétrique peut maintenant être présenté en **Orthographique**, **Perspective**, **Filaire** ou **Blueprint**.
- Les projections sont sélectionnables depuis la barre d’outils des aperçus paramétriques et restent compatibles avec l’orbite souris/clavier et les liens OBJ/STL/SCAD existants.
- Le Twin/Mécanique conserve son sélecteur de presets, son rendu WebGL et son fallback SVG sur le même maillage éditable.
- Aucun détail industriel, solveur physique ou matériel réel n’est inventé par ces modes de présentation.

## Anti-régression

- `pnpm run check` : OK — catalogues i18n synchronisés, TypeScript sans erreur.
- Tests ciblés Parametric Preview + Mechanical Twin : **23/23 OK**.
- `pnpm run build` : OK.
- `GET /manus-routes.json` : HTTP 200, manifeste conservé.
- Prévisualisation Vite : HTTP 200 sur le port 3000.

Les projections restent des rendus de présentation de la géométrie disponible et ne constituent pas une certification mécanique, CFD, MEF ou de fabrication.
