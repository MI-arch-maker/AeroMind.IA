# AeroMind — préparation contrôlée à la fabrication

Cette extension ajoute la route `/build-readiness`, sans remplacer ni modifier les flux historiques. Elle apporte une checklist de préparation, des métadonnées projet/révision, un état local navigateur et un export JSON de préparation.

## Portée

Cette page organise les revues humaines avant une éventuelle décision prise hors de l’application. Les cases sont des déclarations locales non vérifiées. L’export est explicitement `PREPARATION ONLY — NOT RELEASED FOR MANUFACTURE`.

Elle n’ajoute pas de CAO industrielle volumique, sketcher contraint, gestion certifiée des tolérances ou interférences, calcul EF/CFD réel, plans industriels, G-code, intégration CNC/imprimante, pilotage matériel, certification, navigabilité ou autorisation de fabrication. Aucune machine ou actionneur n’est commandé.

## Prévisualisation locale

Depuis `frontend/`, installer les dépendances avec le lockfile (`pnpm install --frozen-lockfile`) puis exécuter `pnpm dev:static -- --port 3000`. Ouvrir `http://localhost:3000/build-readiness`. Environnement de prévisualisation de développement uniquement; aucune publication ou intégration matérielle.

## Fichiers modifiés/ajoutés

- `frontend/client/src/pages/BuildReadiness.tsx`
- `frontend/client/src/pages/build-readiness.css`
- `frontend/client/src/App.tsx` (route lazy isolée)
- `frontend/client/public/manus-routes.json`
