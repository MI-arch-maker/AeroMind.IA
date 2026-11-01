# Plan de livraison — modernisation AeroMind

## Décisions de portée

- Conserver l’archive AeroMind fournie, ses modules d’ingénierie, de simulation, d’administration, de LabBench et son identité visuelle. Éviter toute reconstruction ou suppression de modules historiques.
- Achever la modernisation du Centre Parametric sur les contrats, variables, persistance, sélection, opérations réellement prises en charge, échanges et présentation honnête des limites relevées par les audits/backlog CPV2.
- Rendre le Poste de commande de vol strictement virtuel dans cette distribution. Aucun SITL ne démarre automatiquement; aucune connexion réelle, commande MAVLink sortante ou activation HIL/HARDWARE n’est autorisée par les scripts et le runtime de démonstration.
- Ajouter au Poste de commande le panneau `VIRTUAL` et la checklist bilingue de préparation laboratoire/EASA. Celle-ci est un aide-mémoire, pas une autorisation ni une certification.
- Corriger les surfaces API sensibles pour imposer identité authentifiée, propriétaire et projet explicites, notamment géofences, préflight, flotte et historique télémétrique.
- Livrer les sources complètes en ZIP et une Preview WebDev active. Ne pas publier en production ni migrer une base externe.

## Architecture et approche d’implémentation

Le frontend reste l’application React/TypeScript/Vite existante, intégrée à `Home.tsx` et au système de fenêtres AeroMind. Le résolveur `homeViewRouting.ts` permet l’accès direct `/?view=<id>` aux vues du workspace; `App.tsx` reste propriétaire des routes SPA et des pages d’administration/audit. Le manifeste `frontend/client/public/manus-routes.json` déclare les routes réellement présentes et leurs paramètres de vue.

Les contrats du Centre Parametric restent côté frontend dans les modèles existants, avec schémas Zod versionnés pour les snapshots Mechanical Twin, variables, esquisses, features, maillages et historique. Les services de workspace/persistance et le graphe paramétrique gardent une frontière explicite avec l’interface. Les opérations de géométrie réutilisent le moteur de maillage/CSG livré; tout calcul non couvert est désactivé ou présenté comme approximatif, sans prétention B-Rep industrielle.

Le backend conserve FastAPI, SQLAlchemy et les modules existants dans `web/`. Les gardes d’accès vérifient l’utilisateur et le propriétaire du projet avant toute lecture/écriture, et échouent fermement si l’identité ou le projet manque. Le runtime de démo utilise seulement SQLite locale isolée; la Preview ne provisionne pas de base managée. Les snapshots, historiques, alarmes et géofences sont toujours filtrés par propriétaire/projet explicites.

La séparation de sécurité s’appuie sur `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et `AEROMIND_SITL_AUTOSTART=false` dans les scripts `start.sh`, `start_framework.sh`, les scripts npm/pnpm de démarrage et les valeurs par défaut du conteneur. Les services de commande refusent le mode matériel lorsque le verrou virtuel est posé. Les fonctions de simulation restent distinguées des commandes physiques; aucune action de code ne doit ouvrir de transport matériel dans cette livraison.

## Structure du projet

- `frontend/client/src/pages/Home.tsx` : coque de workspace et montage des vues AeroMind.
- `frontend/client/src/lib/homeViewRouting.ts` : résolution pure des vues directes et alias.
- `frontend/client/src/components/` : Centre Parametric, fenêtres, Poste de commande de vol, contrôle VIRTUAL et checklist labo.
- `frontend/client/src/lib/` : contrats Zod/TypeScript, modèles géométriques, variables, échanges et traductions FR/EN.
- `frontend/client/public/manus-routes.json` : déclaration statique des routes Preview.
- `web/` : API FastAPI, authentification, isolation propriétaire/projet, géofences, préflight, télémétrie et gardes matériel/virtuel.
- `tests/` : suites Vitest/TypeScript et pytest couvrant les modèles UI, l’isolation multi-tenant et les protections de mode virtuel.
- `CHECKLIST_LABORATOIRE_AEROMIND_EASA.md`, `PLAN_INTEGRATION_SECURITE_AEROMIND_2026-11-01.md` : documentation des limites et des points de vigilance laboratoire.

## Identité et design conservés

- **Mouvement :** poste d’ingénierie aérospatiale sombre, croisé avec un studio technique de conception; prolonger le langage AeroMind au lieu de redessiner la marque.
- **Principes :** source géométrique partagée; séparation claire entre workspace, calcul et persistance; retours visibles; limites et provenance toujours honnêtes.
- **Couleur :** graphite/carbone pour la scène, cyan AeroMind pour géométrie et actions primaires, ambre pour alertes/fabrication, couleurs secondaires mesurées pour les calques et statuts.
- **Disposition :** navigation conservée, viewport de conception au centre, inspecteur contextuel et fenêtres de workspace déplaçables; maximisation qui n’empiète pas sur la sidebar.
- **Signatures :** sélecteur `Part Studio / Variable Studio / Assembly`, arbre relié aux IDs de pièces, badges `VIRTUAL / SIMULATION / NON CERTIFIÉ`.
- **Interaction :** opérations réversibles lorsque le modèle le permet; action non prise en charge désactivée ou décrite comme aperçu; aucune réussite fictive ni écriture métier cachée.
- **Animation :** mouvements brefs et fonctionnels pour ouverture, sélection et changement d’onglet; aucune animation ne doit suggérer un mouvement réel d’aéronef ou une activation matérielle.
- **Typographie :** conserver Inter et les libellés monospace techniques déjà utilisés par AeroMind.
- **Voix :** microcopie opérationnelle, précise et sans promesse industrielle. Exemples : « Aperçu seulement — la géométrie source reste inchangée. » et « VIRTUAL — aucune sortie vers un aéronef. »
- **Essence de marque :** environnement AeroMind d’ingénierie et de simulation pour équipes aéronautiques; technique, lisible, prudent.

## Contraintes de données et capacités

CSV/JSON sont traités comme formats de variables/configuration et d’historique selon leur contrat; OBJ/STL restent les formats de maillage réellement pris en charge. STEP, IGES, DXF, 3MF ou GLB ne sont pas revendiqués sans encodeur/décodeur vérifié. Les analyses de masses, centre de gravité, inertie, structure et aérodynamique exigent des données et équations traçables; sinon elles restent « proxy », indicatives ou indisponibles. Le projet ne revendique pas de B-Rep, solveur général de contraintes, CFD/FEA, certification ou validation industrielle.

## Développement et Preview

Le build frontend s’effectue avec pnpm 10.18.0 depuis `frontend/`; le backend Python utilise les dépendances du projet et sélectionne `.venv/bin/python` lorsqu’il est présent, sinon `python3`. La build Vite génère `frontend/dist`. En Preview WebDev, Vite écoute sur le port configuré 3000 et relaie les requêtes `/api` vers FastAPI sur le port interne 8000; le proxy de prévisualisation expose ainsi le frontend et l’API sous le même origin. Le script `start.sh` peut également lancer FastAPI et servir le build compilé sur `PORT` (3000 par défaut), en SQLite locale isolée et en mode virtuel strict. Le fichier `/manus-routes.json` doit être servi comme JSON réel, et non comme fallback HTML. La sauvegarde concerne le dépôt de travail et le ZIP; aucune publication de production, connexion matérielle ou migration d’une base distante n’est comprise dans cette livraison.
