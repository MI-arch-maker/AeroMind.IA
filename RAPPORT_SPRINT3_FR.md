# Rapport Sprint 3 — Jumeau numérique d’usine et assemblage physique

**Client :** ICX Power Solutions SRL  
**Plateforme :** AeroMind  
**Statut :** livré et vérifié en sandbox — simulation et export virtuels

## Périmètre livré

Le Sprint 3 ajoute le routeur `web/factory_api.py`, enregistré dans FastAPI sous `/api/factory`, ainsi qu’un poste opérateur autonome à `/factory-digital-twin`.

### LiDAR atelier

Le service accepte les formats PLY ASCII, XYZ, CSV et JSON contenant des triplets de coordonnées. Les fichiers sont bornés à 64 MiB et 2 000 000 points. Le pipeline valide les valeurs finies, calcule les bornes XYZ, calcule une empreinte SHA-256 et applique une décimation par grille voxel déterministe pour produire un payload d’affichage plafonné à 100 000 points. Le frontend dessine réellement le nuage importé dans un canvas, avec indicateurs de cardinalité et de granularité.

### Assemblage 4D et collisions

Le contrat d’assemblage contient des pièces, robots et gabarits sous forme de volumes AABB, ainsi que des étapes temporisées et des transformations par entité. Chaque étape est recalculée côté serveur. Tout recouvrement strict de deux volumes produit une entrée de journal `AABB_INTERFERENCE`, de sévérité `BLOCKING`, et marque l’étape et la simulation comme bloquées. Le frontend expose la gamme, le statut par étape, le journal et le compteur d’interférences.

### Export usine

Le service produit des exports JSON laser, JSON RA/MR et CSV. Chaque paquet contient le repère `factory-world`, l’unité déclarée, l’origine, le facteur d’échelle et les coordonnées transformées des volumes. L’interface présente explicitement la valeur `scale=1.000` et `physical_output=false` : aucun laser, robot, projecteur ou équipement MR réel n’est commandé.

## Preuves d’exécution

- `pnpm check` : OK.
- `pnpm build` : OK.
- `PYTHONPATH=. .venv/bin/python -m pytest -q tests/test_inspection_api.py` : 3 tests OK.
- `PYTHONPATH=. .venv/bin/python -m pytest -q tests/test_factory_api.py` : tests Sprint 3 ciblés.
- Smoke test collision : une AABB en recouvrement est bloquée et journalisée.
- `py_compile` : `web/factory_api.py`, `web/app.py`, `web/capability_policy.py` valides.

## Limites explicites

Le lecteur fourni ne prétend pas être un lecteur E57/LAS propriétaire : les données doivent être exportées dans l’un des formats documentés. Le noyau de collision est volontairement borné aux AABB déclarées ; il ne remplace pas une validation B-Rep/mesh à haute fidélité, une cinématique certifiée constructeur ou une vérification de singularités robot. Les exports sont des contrats géométriques opérationnels pour intégration, mais ne constituent pas une calibration de projecteur laser, un post-processeur robot ou une certification de réalité mixte. La résolution et la fidélité d’un maillage CAO propriétaire restent à fournir par le connecteur CAO concerné.

## Routes

- `GET /api/factory/capabilities`
- `POST /api/factory/lidar/import?voxel_size=...`
- `POST /api/factory/assembly/simulate`
- `POST /api/factory/export`
- `GET /factory-digital-twin`
