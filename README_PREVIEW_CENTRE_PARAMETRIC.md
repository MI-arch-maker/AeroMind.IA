# AeroMind — copie modernisée du Centre Parametric

Cette copie conserve l’application AeroMind complète et les sources historiques. Le suivi d’exécution du backlog CPV2 est dans `TODO_CENTRE_PARAMETRIC_V2.md`; le plan source antérieur est conservé dans `PLAN_SOURCE_ORIGINALE_AEROMIND.md`.

## Démarrage local de démonstration

Prérequis : Python 3.12, Node.js et pnpm 10.18.0. Depuis la racine du projet :

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm --dir frontend install --frozen-lockfile
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Dans un premier terminal, démarrer l’API avec une base SQLite locale isolée :

```bash
export AEROMIND_ENV=development
export AEROMIND_AUTO_CREATE_SCHEMA=true
export AEROMIND_SITL_AUTOSTART=false
export AEROMIND_VIRTUAL_ONLY=true
export HARDWARE_CONTROL=false
export DATABASE_URL=sqlite:///./data/aeromind-preview.db
export AEROMIND_SESSION_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
.venv/bin/python -m uvicorn web.app:app --host 127.0.0.1 --port 8000
```

Dans un second terminal :

```bash
cd frontend
PORT=3000 corepack pnpm@10.18.0 run dev:static
```

Ouvrir `http://127.0.0.1:3000/?view=parametric-center`. Le serveur Vite proxifie les appels API vers `http://127.0.0.1:8000`. Le dossier `data/` contient la base locale et n’est pas livré. Cette procédure ne configure aucune base externe, ne démarre pas SITL et ne permet aucune sortie matérielle. `AEROMIND_VIRTUAL_ONLY=true` verrouille également les transitions HIL/HARDWARE côté serveur, même si `HARDWARE_CONTROL` est modifié par erreur.

## Vérifications frontend

Depuis `frontend/` :

```bash
pnpm exec vitest run --config vite.config.ts
pnpm exec tsc --noEmit -p tsconfig.json
pnpm run build
pnpm run i18n:catalogs
```

L’exécution du lint de chaînes codées en dur sur le dépôt entier reste distincte : des diagnostics existent dans d’autres écrans historiques, hors Centre Parametric. Les limites de validation Python héritées sont décrites dans `TODO_CENTRE_PARAMETRIC_V2.md`.

## Limites de l’atelier

Le Centre travaille sur les meshes et opérations procédurales supportés par le projet; il ne fournit pas de noyau B-Rep industriel, de solveur de contraintes, de fillet/chamfer exact, de CFD/FEA, de certification géométrique ou de pilotage réel. Les métriques marquées « proxy » ne sont pas des résultats certifiés.


## Poste de commandement de vol et sécurité laboratoire

L’écran Poste de commande s’ouvre via `http://127.0.0.1:3000/?view=mission-center`. Le panneau de gouvernance se trouve à `/?view=command-center`; Mission Planner à `/?view=mission-planner`; Simulation à `/?view=simulation`. Tous les IDs de vues supportés sont également résolus par `?view=<id>` (les alias historiques `tools` et `inspector` ouvrent Digital Twin Explorer). Le routeur sert toujours une seule route SPA `/`.

Le poste propose la simulation locale du scénario et des actions VIRTUAL côté API seulement lorsque l’utilisateur est authentifié. L’authentification serveur reste obligatoire pour VIRTUAL; ne pas la contourner dans la Preview. Les scripts `start.sh`, `start_framework.sh`, `pnpm dev`, `pnpm dev:api` et `pnpm start` imposent `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et l’absence d’autodémarrage SITL. Le serveur refuse les transitions HIL/HARDWARE et aucune liaison autopilote n’est configurée. Ne pas désactiver ce verrou ni connecter un aéronef. Les boutons SIMULATION manipulent uniquement l’état local de démonstration; ils ne valident ni le système réel ni l’environnement de vol.

La checklist d’accompagnement est dans `CHECKLIST_LABORATOIRE_AEROMIND_EASA.md` et dans le panneau du poste de vol. Elle liste des éléments à cadrer/vérifier, cite des sources officielles à consulter, et ne constitue pas une autorisation, une validation de conformité ni une certification. Une revue par l’autorité/les responsables compétents et des protocoles distincts sont nécessaires avant toute phase matérielle.
