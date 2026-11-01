# Rapport final de modernisation — AeroMind

**Date :** 1 novembre 2026.  
**Périmètre :** Centre Parametric, Poste de commande de vol, LabBench, isolation propriétaire/projet, navigation et livraison.  
**Runtime :** Preview WebDev, Vite sur le port 3000 relayant `/api` vers FastAPI sur le port 8000; SQLite locale isolée.  
**Statut :** prêt en Preview; aucun déploiement de production ni connexion à un matériel réel.

## Livrables

Le projet source corrigé est remis sous forme d’archive ZIP : `aeromind_final_source_2026-11-01.zip`. La Preview AeroMind est disponible à [ouvrir la Preview](https://8328-ifnzskpn8ffu8v6mehzh9-7b74cc1f.us5.manus.computer/). Le dépôt conserve l’application et l’identité AeroMind existantes; les autres modules n’ont pas été remplacés par une maquette séparée.

## Centre Parametric

Le Centre Parametric s’ouvre directement avec `/?view=parametric-center`. Part Studio, Variable Studio et Assembly ont des vues distinctes. Le modèle associe l’arbre, l’inspecteur et les opérations à la pièce sélectionnée par son identifiant stable. Les variables utilisateur sont éditables, validées par type, unité, plage et références; les expressions utilisent un évaluateur arithmétique limité, sans `eval`, et rejettent les cycles et valeurs non finies. L’annulation et la reprise couvrent les changements pris en charge.

Les snapshots Mechanical Twin utilisent un schéma Zod versionné et refusent les entrées invalides au lieu de les remplacer silencieusement par un espace vide. Les valeurs de débattement et modifications de pièce sont persistées; « Reset features » restaure les pièces sources et leur visibilité. Les échanges couverts incluent CSV pour les variables, JSON versionné pour le workspace et les formats mesh OBJ/STL déjà pris en charge.

Les limites affichées restent explicites : géométrie triangulée/procédurale, pas de noyau B-Rep industriel, de solveur général de contraintes, de fillet/chamfer exact, de garantie topologique STEP/IGES/DXF, de CFD/FEA ni de métrique certifiée. Les masses/surfaces empiriques restent étiquetées « proxy »; centre de gravité, inertie ou coefficients non calculés sont montrés comme indisponibles. Aucun format non vérifié n’est revendiqué.

## Poste de commande et sécurité

Le runtime démarre avec `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et `AEROMIND_SITL_AUTOSTART=false`. Le statut API Preview vérifié indique `virtualOnly=true`, `hardwareControlEnabled=false`, `physicalOutputEnabled=false` et `physicalCommandsEmitted=false`. Le verrou virtuel neutralise également `HARDWARE_CONTROL=true`; les endpoints de commande, d’inscription de pool, de revue N4, d’émission de jeton et d’observation MAVLink sont refusés avant l’ouverture ou l’usage d’un transport physique. La diffusion globale d’arrêt d’urgence reste désactivée. Les formulaires d’URL MAVLink/commandes sont désactivés dans LabBench, et aucun chemin UI ne propose une activation post-HIL.

Le panneau `VIRTUAL` et la checklist laboratoire/EASA sont bilingues. Ils organisent les contrôles de préparation et les garde-fous, mais ne constituent ni approbation EASA, ni certification, ni preuve d’un essai réel. L’écran indique explicitement que la démonstration ne commande aucun aéronef. Les flux externes de télémétrie MAVLink/WSS sont désactivés dans la Preview stricte.

## Isolation des données

Les géofences sont mises en cache sous clé composite `(project_id, owner_id)`; une lecture de base sans propriétaire authentifié échoue. Les routes fournissent l’utilisateur authentifié et vérifient la propriété du projet. Le préflight refuse les auto-checks sans owner/projet explicites et ne poll pas MAVLink en mode virtuel. Les snapshots, calculs, clés de déduplication des alertes et endpoints d’historique/CSV filtrent par projet et propriétaire. Les tests de régression couvrent l’accès cross-tenant et le rejeu d’un drone partagé entre projets.

## Vérifications effectuées

- **Backend :** `.venv/bin/python -m pytest -q` — **293 réussites, 14 ignorés, 0 échec**. Trois avertissements non bloquants restent (notamment dépréciation de scope pytest-asyncio, alias Starlette et classe `TestRun` non collectable).
- **Frontend :** `pnpm run check` réussi; Vitest — **75 fichiers, 363 tests réussis**; `pnpm run build` réussi. Vite signale encore des bundles minifiés volumineux (entrée principale environ 3,66 Mo; vendor-markdown environ 3,84 Mo), chantier de performance distinct.
- **PostgreSQL :** les intégrations PostgreSQL réelles n’ont pas été exécutées dans ce sandbox, le paquet `pgserver>=0.5.0` n’étant pas disponible sur l’index utilisé. Le Preview vérifié utilise SQLite locale isolée.
- **Preview HTTP :** `/api/health`, `/api/ready`, `/api/hardware/status`, `/manus-routes.json`, `/`, `/?view=parametric-center`, `/?view=mission-center`, `/?view=labbench`, `/labbench` et `/engineering-hub` ont répondu HTTP 200. Le manifeste sert un vrai JSON de **28 routes**.
- **Rendu navigateur :** captures prises pour l’accueil, le Centre Parametric, le poste de vol, LabBench et les alias historiques. Le navigateur confirme le mode brouillon sans projet inventé et la mention `VIRTUAL ONLY — aucune liaison matérielle`.
- **Scripts :** `bash -n start.sh start_framework.sh` et la validation JSON du manifeste réussies. Les scripts choisissent le `.venv` local s’il est présent, gardent un repli `python3` pour les images Docker et imposent le mode logiciel strict.

## Limites et environnement de livraison

La Preview n’est pas un service de vol, un simulateur certifié ni un dispositif d’essai matériel. Elle n’a pas été reliée à un aéronef, à un contrôleur de vol, à un port série ou à une base distante. Aucune commande réelle n’a été émise. La publication en production est désactivée. Les comptes d’authentification externes peuvent apparaître comme non configurés dans ce workspace, ce qui n’empêche pas la navigation locale en mode brouillon; cela ne doit pas être confondu avec une identité fédérée opérationnelle.

Pour exécuter le ZIP localement : installer les dépendances Python du dépôt et celles du frontend avec `pnpm` 10.18.0, construire la partie frontend, puis lancer `./start.sh`. En présence de `.venv`, le script utilise cet interpréteur. Il crée une base SQLite locale, désactive les sorties matérielles et démarre FastAPI sur `PORT` (3000 par défaut). Pour les détails CPV2, voir `TODO_CENTRE_PARAMETRIC_V2.md`; les points de vigilance laboratoire figurent dans `CHECKLIST_LABORATOIRE_AEROMIND_EASA.md` et `PLAN_INTEGRATION_SECURITE_AEROMIND_2026-11-01.md`.
