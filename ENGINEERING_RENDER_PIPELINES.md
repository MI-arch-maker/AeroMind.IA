# Architecture des pipelines de rendu AeroMind

## Routage

`MechanicalTwinViewport` résout chaque valeur du menu dans `renderEngines.ts`, exécute `runEngineeringSolver()` sur le mesh actif et expose `data-render-pipeline` et `data-render-solver`. Les résultats calculés sont conservés dans `geometry.userData.engineeringSolver` puis rendus par des overlays Three.js.

## Matrice implémentée

| Option | Pipeline exécuté | Sorties visibles |
|---|---|---|
| CFD | `surface-panel-cfd-v2` | pression de surface, vecteurs de vitesse tangents, streamlines intégrées |
| MEF | `euler-bernoulli-fea-v2` | champ Von Mises, gradient de déformation et points de zones de charge |
| Flux énergétique | `surface-transport-particles-v2` | champ scalaire, particules et traces advectées |
| Squelette bionique | `stress-guided-lattice-v2` | treillis procédural et diagonales filtrés par le champ de contrainte |
| Écorché | `assembly-explode-clipping-v2` | translation d’explosion, clipping plane GPU et assemblage actif |
| Wireframe | `topology-extractor-v2` | extraction des index/arêtes du mesh réel |
| Blueprint | `hidden-line-depth-peeling-v2` | arêtes, transparence et visibilité partielle X-Ray |
| Carbone | `anisotropic-carbon-shader-v2` | shader fibres/tissage procéduraux, anisotropie dépendante de l’incidence |
| Cristal | `ior-refraction-depth-peeling-v2` | shader IOR/Snell, réfraction et transparence multi-couches |
| ArchViz | `progressive-physical-ray-v2` | matériau MeshPhysical, clearcoat, AO/éclairage physique et accumulation progressive côté viewport |

## Limites d’ingénierie

CFD est un solveur local de panneaux de surface : il ne remplace pas un domaine volumique Navier–Stokes, la turbulence, les conditions aux limites ou une validation expérimentale. MEF est un modèle analytique Euler–Bernoulli 1D projeté sur un mesh : il ne remplace pas un solveur EF 3D avec matrice de rigidité, liaisons, contact et fatigue. Le treillis bionique est une optimisation heuristique locale guidée par contrainte, non une certification de masse/flambement. Le clipping GPU ne reconstruit pas un B-Rep CAO exact. Les passes de transparence et le rendu physique disposent d’un fallback WebGL si les extensions multi-couches/WebGPU ne sont pas disponibles.

Les résultats sont destinés à l’exploration et à la revue technique. Ils ne constituent pas une certification aéronautique, une autorisation de vol ni un dimensionnement qualifié.
