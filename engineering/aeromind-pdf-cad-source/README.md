# Sources CAO des cellules issues du PDF

`generate_cad.py` génère les géométries conceptuelles, les exports OBJ/STL, les sources OpenSCAD et les rendus 3D; `generate_hud.py` génère les vues de plan HUD à partir des mêmes profils déclaratifs. Les manifestes JSON listent les fichiers et le nombre de composants contrôlés.

Les dimensions sont des cotes illustratives de maquette issues d’une reconstruction depuis des images 2D, non un relevé technique. Les huit modèles sont des démonstrateurs visuels, sans certification, validation mécanique ou aérodynamique. La variante `08-attaque-blanc` conserve le nom de fichier historique pour la traçabilité, mais son profil et ses sorties ont été renommés dans le projet comme cellule non armée; les éléments externes offensifs du prototype initial ont été retirés avant l’intégration.

Dépendances Python listées dans `requirements.txt`. Les artefacts intégrés et téléchargeables se trouvent dans `frontend/client/public/assets/aeromind-cell-library/`.
