# AeroMind — Mission Control et variables paramétriques

Date : 31 octobre 2026

## Corrections exécutées

Mission Control ne bloquait plus le calcul local sur la seule absence de projet serveur. La disponibilité du moteur est maintenant déterminée par la présence d’une configuration numérique complète. Une cellule configurée localement peut donc produire les sorties de portée, autonomie, attitude cinématique, masse, puissance, marge au vent et alertes, sans persistance serveur et sans commande matérielle.

Le bouton de recalcul, le démarrage/pause, la fin de mission, l’analyse locale, la comparaison, les scénarios et les sorties moteur restent des fonctions de simulation locale. Ils demeurent désactivés uniquement lorsqu’il manque réellement une cellule exploitable ou des dimensions/énergie nécessaires.

Dans le Centre Paramétrique, les variables principales étaient déjà reliées à `ConceptConfig`, mais plusieurs variables géométriques restaient locales. La propagation complète a été ajoutée pour le Mechanical Twin actif : `sweep` vers `sweepDeg`, `dihedral` vers `dihedralDeg`, `max_thickness` vers `fuselageHeight`, `fuse_sec3_top` vers `fuselageWidth` et `thickness_ratio` vers une hauteur dérivée de la corde. Les modifications reconstruisent le modèle 3D sélectionné.

La modification précédente des sections circulaire, elliptique et polygonale reste active et compatible avec cette propagation.

## Preuves

- `pnpm run check` : succès.
- Suite Vitest : 70 fichiers et 335 tests réussis.
- Tests de géométrie : sections et propagation des variables vers le maillage réussies.
- `pnpm run build` : succès.
- Preview : HTTP 200.

Les seuls messages de build restants concernent l’avertissement Vite sur les gros chunks et le script de configuration runtime non-module ; aucun échec de compilation.
