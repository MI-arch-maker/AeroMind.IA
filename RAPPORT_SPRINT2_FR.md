# AEROMIND — Rapport d’exécution Sprint 2

## Objet

Mise à niveau du contrôle qualité des matériaux et de la métrologie volumétrique conformément au cahier des charges Sprint 2. L’audit du code Sprint 1 a établi que le catalogue matériaux existait, mais qu’il ne constituait pas un pipeline d’inspection; le mode « X-ray » était une transparence de maillage et aucun calcul Scan-to-CAD n’était présent.

## Livré

### CT / voxels / raycasting

- Nouveau routeur `POST /api/inspection/volume/import`.
- Profils d’entrée explicites : JSON voxel calibré (`dimensions`, `spacing_mm`, `origin_mm`, `values`) et tableau NumPy `.npy` 3D.
- Limites d’ingestion : 32 MiB par artefact et 2 097 152 voxels maximum.
- Validation des dimensions, pas voxel, valeurs finies, plage de densité et empreinte SHA-256.
- Retour d’une texture 3D normalisée et bornée pour le rendu interactif.
- Nouveau shader WebGL2 de volume ray-marching avec seuil de densité et gain d’accumulation réglables.
- La vue permet d’examiner des zones internes selon le seuil; elle n’invente pas de coefficient HU constructeur lorsqu’il n’est pas fourni.

### Scan-to-CAD / métrologie

- Nouveau routeur `POST /api/inspection/metrology/compare`.
- Profils d’entrée : ASCII PLY, STL ASCII/binaire et JSON `points`/`vertices`.
- Contrôle de taille et de finitude des coordonnées.
- Alignement Best-Fit itératif déterministe par correspondances au sommet CAO le plus proche et résolution rigide Kabsch.
- Rapport d’écarts en micromètres : min, max, moyenne, P95, RMS, tolérance et nombre de points hors tolérance.
- Heatmap frontend graduée par rapport à la tolérance choisie, avec statut dans/hors tolérance.
- Hash des deux fichiers, méthode, nombre d’itérations et niveau d’évidence inclus dans le rapport.

## Intégration

- Nouvelle page : `/inspection-quality`.
- Manifeste `manus-routes.json` synchronisé.
- Autorisations serveur ajoutées : capacités publiques en lecture; import CT et comparaison métrologique classés L3.
- Le pipeline reste soumis à l’authentification AeroMind existante et aux revues humaines de qualité.

## Vérifications exécutées

- `PYTHONPATH=. .venv/bin/pytest -q tests/test_inspection_api.py` : **3 tests passés**.
- `pnpm check` : **TypeScript sans erreur**; catalogue i18n synchronisé.
- `pnpm build` : **build Vite réussi**.
- Suite Vitest existante : **101 fichiers, 552 tests passés**.
- Contrôle JSON du manifeste de routes : **valide**.

## Limites déclarées

- Le profil E57 est rejeté explicitement jusqu’au déploiement d’un lecteur E57 natif; aucune conversion silencieuse n’est effectuée.
- Le Best-Fit utilise la tessellation importée et les sommets CAO comme représentation bornée; il ne prétend pas calculer une distance exacte à une surface B-Rep ni le signe normal sans normales de surface qualifiées.
- Le raycasting visualise un champ voxel normalisé; une calibration HU, une segmentation médicale/industrielle et une décision d’acceptation restent de la responsabilité du plan de contrôle et du métrologue habilité.
- Aucun résultat ne constitue une certification matériau, une libération de lot, une qualification EASA ou une autorisation de fabrication.
