# AeroMind — Optimisation du guidage et modèle aérodynamique

**Date :** 30 octobre 2026

## Résultat

Deux fonctions analytiques nouvelles sont intégrées à l’application AeroMind, toutes deux isolées dans le périmètre simulation/conception. Aucun contrôleur, transport de commande, gate ou endpoint matériel n’a été modifié.

## 1. Guidage de mission local

Le nouveau module `missionRouteOptimizer.ts` remplace l’heuristique de détour à proximité d’un waypoint. Il projette une route WGS84 en coordonnées ENU locales, gonfle les obstacles circulaires selon leur rayon et une marge par défaut de 20 m, construit un graphe de visibilité sur des frontières polygonales conservatrices, puis utilise Dijkstra pour choisir un chemin court. La route garde l’ordre et les extrémités des points d’origine. Les entrées bloquées ou les corridors infaisables produisent un refus explicite plutôt qu’un faux succès.

Dans Mission Planner, le calcul génère uniquement des suggestions locales. Rien ne modifie le plan avant le clic explicite « Appliquer les suggestions »; aucun téléversement ni ordre au véhicule n’est déclenché. Si aucun détour n’est nécessaire, l’interface informe l’utilisateur et laisse le plan intact.

## 2. Modèle aérodynamique de voilure fixe

Une nouvelle carte est ajoutée à AeroLab pour une estimation conceptuelle sur voilure fixe. Elle calcule la densité atmosphérique à partir de la pression ISA troposphérique et de la température du scénario, la surface trapézoïdale, l’allongement, le facteur de charge en virage coordonné, le CL requis, la traînée via la polaire `CD = CD₀ + CL²/(π e AR)`, la puissance `D × V`, la vitesse de décrochage au facteur de charge, la marge à `1,3 × Vs`, la finesse et le rayon de virage. Une architecture non reconnue comme voilure fixe renvoie « non applicable » plutôt qu’une performance attribuée à tort.

CD₀, efficacité d’Oswald, CLmax et inclinaison de virage sont réglables dans le panneau. La masse utilisée provient de la masse à vide du scénario plus sa charge utile, sans double-compter la charge utile AeroMind. Les coefficients par défaut sont des hypothèses non calibrées; la puissance ignore notamment le rendement de propulsion. Les résultats restent des estimations de simulation, sans validation physique.

## Validation

- `pnpm check` : contrôle TypeScript réussi; catalogues synchronisés (**2 617 clés**).
- `pnpm test` : **64 fichiers, 306 tests réussis**, incluant 6 cas de routage et 4 cas aérodynamiques.
- `pnpm build` : build de production réussi.

Le build signale les avertissements déjà non bloquants de taille de bundles ainsi que le script runtime `/api/platform/config.js`; aucune de ces alertes n’a fait échouer la validation.
