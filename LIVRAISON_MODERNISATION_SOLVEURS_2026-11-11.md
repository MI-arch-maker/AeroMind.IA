# Livraison — Modernisation des solveurs et pipelines AeroMind v2

Date : 11 novembre 2026

## Résultat

Le module de rendu a été refondu pour relier les options techniques du menu à des solveurs locaux et matériaux dédiés exécutés sur la géométrie active. Le registre, les calculs, les overlays Three.js, les shaders et les tests sont inclus dans cette livraison.

## Matrice livrée

| Exigence | Implémentation | Sortie rendue |
|---|---|---|
| Carte CFD | `surface-panel-cfd-v2` | pression de surface, vecteurs de vitesse et streamlines |
| Carte MEF | `euler-bernoulli-fea-v2` | Von Mises, gradient de déformation et zones de charge |
| Flux énergétique | `surface-transport-particles-v2` | particules, traces et champ scalaire |
| Treillis bionique | `stress-guided-lattice-v2` | nœuds et diagonales procéduraux guidés par contrainte |
| Écorché/coupe | `assembly-explode-clipping-v2` | explosion, clipping plane GPU et transparence |
| Wireframe/Blueprint | `topology-extractor-v2` / `hidden-line-depth-peeling-v2` | arêtes et topologie du mesh actif |
| Carbone | `anisotropic-carbon-shader-v2` | fibres, tissage procédural et anisotropie d’incidence |
| Cristal | `ior-refraction-depth-peeling-v2` | IOR/Snell, réfraction et transparence multi-couches |
| ArchViz | `progressive-physical-ray-v2` | MeshPhysical, clearcoat, sheen, AO/éclairage physique |

## Fichiers principaux modifiés

- `frontend/client/src/lib/engineeringSolvers.ts`
- `frontend/client/src/lib/engineeringMaterials.ts`
- `frontend/client/src/lib/renderEngines.ts`
- `frontend/client/src/components/MechanicalTwinViewport.tsx`
- `frontend/client/src/lib/engineeringSolvers.test.ts`
- `frontend/client/src/lib/renderEngines.test.ts`
- `ENGINEERING_RENDER_PIPELINES.md`
- `plan.md`
- `TODO.md`

## Vérifications

- Suite Vitest : **83 fichiers, 394 tests passés**.
- Tests ciblés solveurs/rendu : **9 tests passés**.
- `pnpm exec tsc --noEmit` : succès.
- `pnpm build` : succès.
- Compilation Python backend : succès.
- Prévisualisation `/api/health` : HTTP 200, statut `ok`, base de test connectée.
- Page `/` : HTTP 200, racine React présente.
- `/manus-routes.json` : HTTP 200, JSON valide.

## Limites de qualification

Le CFD est un calcul local de panneaux et le champ structurel est un modèle Euler–Bernoulli projeté sur le mesh; ils ne remplacent pas un calcul Navier–Stokes volumique ou EF 3D qualifié. Le treillis est stress-guided heuristique. Le clipping GPU ne reconstruit pas un B-Rep CAO. Les shaders cristal et ArchViz disposent d’un fallback lorsque les capacités depth-peeling/WebGPU ne sont pas disponibles. Ces résultats restent exploratoires et ne constituent ni certification, ni dimensionnement aéronautique, ni autorisation de vol.

## Prévisualisation vérifiée

https://3000-ioqmqz29zizegprwlojov-58cf1252.us5.manus.computer/
