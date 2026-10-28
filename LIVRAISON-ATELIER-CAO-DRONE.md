# Livraison — fonctions CAO avancées pour l’atelier drone

Les contrôles ont été intégrés à `DroneSketchProWorkbench`, le composant réellement affiché dans IDDS Studio, sans modifier les composants d’authentification ni les paramètres Entra.

L’atelier ajoute l’accrochage aux sommets et milieux des arêtes visibles, le mode ORTHO qui contraint les tracés à 0°, 45° et 90°, le miroir de la sélection sur l’axe central et un réseau linéaire de trois copies. L’inspecteur de transformation expose aussi des champs de coordonnées du centre et d’encombrement (largeur/hauteur) en unités de dessin, avec application numérique. Les outils déjà disponibles — sélection multiple, calques avec visibilité/verrouillage/ordre, composants paramétriques, remplissage, cotations, transformations, historique et animation par images-clés — restent en place.

Les données continuent d’être écrites dans le format `customSketch` existant. Les dimensions sont des unités de représentation et ne constituent ni un modèle de fabrication certifié, ni une validation structurelle ou aéronautique.

**Contrôles effectués :** `pnpm run check` et `pnpm run build:static` réussis. Le DOM de la prévisualisation confirme les actions d’accrochage, miroir et réseau ainsi que les champs numériques de l’inspecteur. Les artefacts `frontend/dist` sont inclus dans le ZIP final.
