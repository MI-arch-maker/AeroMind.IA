# Fonds cartographiques : satellite et mode hors ligne

## Fonds en ligne intégrés

Dans **Navigation satellite**, l’opérateur choisit directement **Plan / Tactique** ou **Satellite**. Le mode tactique privilégie Esri World Street Map, puis Esri World Imagery, OSM et CARTO. Le mode Satellite privilégie Esri World Imagery, puis Esri World Street Map, OSM et CARTO. L’ordre privilégie des sources testées et utilisables dans la prévisualisation : le serveur public OSM a renvoyé HTTP 403 depuis cet environnement, et CARTO a renvoyé une tuile « API KEY REQUIRED » avec HTTP 200, que `img.onerror` ne détecte pas. CARTO reste en dernier recours car une réponse HTTP positive ne garantit pas qu’il s’agisse d’une vraie tuile cartographique. L’attribution du fournisseur actuellement affiché reste visible dans la carte. Il s’agit d’un mécanisme de résilience côté navigateur, pas d’une garantie de disponibilité ni d’une validation des conditions d’utilisation : vérifier les conditions, la couverture, les limites de débit et les obligations d’attribution de chaque fournisseur avant un déploiement ou usage externe.

## Préparer un stockage local MBTiles

Le navigateur ne sait pas lire directement un fichier `.mbtiles` (base SQLite). Il faut héberger les tuiles derrière un serveur HTTP local compatible XYZ qui lit le fichier MBTiles, par exemple un service de tuiles approuvé et préinstallé dans l’environnement de simulation isolé. Le serveur et les données doivent être disponibles sur le réseau local de la zone isolée ; un endpoint Internet ne constitue pas un mode hors ligne.

Définir dans l’environnement de build Vite du client :

```dotenv
VITE_OFFLINE_TILE_URL=http://localhost:8080/tiles/{z}/{x}/{y}.png
```

L’endpoint doit accepter les coordonnées XYZ (`z`, `x`, `y`), fournir des images de tuiles compatibles et autoriser les requêtes du navigateur de l’application (même origine ou CORS). Remplacer l’URL par l’adresse/route réelle du serveur local, puis reconstruire et redéployer le client : `VITE_*` est injecté au moment du build. Lorsque la variable est configurée, ces tuiles deviennent le premier choix dans les deux modes ; les fonds distants restent des replis si le serveur local ou une tuile échoue. Pour une installation strictement déconnectée, désactiver ces replis Internet et traiter l’absence de tuile locale comme une erreur, afin d’éviter toute requête réseau extérieure.

Exemple de vérification à faire lors de l’intégration : démarrer le serveur avec le jeu MBTiles de la zone de test, charger une tuile connue via `http://localhost:8080/tiles/{z}/{x}/{y}.png`, tester le CORS, puis vérifier plusieurs niveaux de zoom et l’attribution/source des données. Limiter la zone et les niveaux de zoom dans la génération du MBTiles selon le stockage disponible. Respecter les licences et obligations de redistribution des données source ; une image satellite n’implique pas automatiquement un droit de téléchargement, mise en cache ou distribution hors ligne.

## Précautions

Le fond de carte est une aide visuelle de préparation. Cette interface ne lit pas le GNSS d’un aéronef, ne calcule pas de trajectoire autonome, ne transmet aucun point et n’est pas un dispositif de navigation certifié.
