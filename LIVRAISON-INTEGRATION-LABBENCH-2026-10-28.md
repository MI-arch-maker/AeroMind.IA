# Livraison AeroMind — intégration native LABBENCH 01

Date : 28 octobre 2026

## Corrections livrées

LABBENCH 01 est désormais rendu directement par la coque `Home` d’AeroMind, au même niveau que les autres interfaces. L’ancienne URL `/labbench` reste disponible comme alias, mais elle ne monte plus une application ou une fenêtre indépendante. Le composant utilise le même projet, la même cellule active et le même `ConceptConfig` transmis par Home.

Le mode intégré supprime la seconde navigation et la seconde coque visuelle LABBENCH. Le rendu apparaît dans le contenu principal AeroMind, avec la source unique du projet visible et les sorties physiques verrouillées.

Les données historiques de navigateur, scénarios par défaut, identités d’émulateur et valeurs hardware fictives ne sont plus considérées comme des données de travail. En l’absence de cellule sélectionnée, de dessin importé ou de saisie utilisateur explicite, l’écran affiche un état vide actionnable et aucun chiffre, résultat, verdict, température, télémétrie ou moteur n’est présenté comme réel. La simulation de flotte refuse également tout drone dont les paramètres n’ont pas été renseignés explicitement.

Les calculs et commandes restent bornés au mode virtuel et reliés au workspace partagé. Le transport physique demeure désactivé.

## Fichiers principaux

- `frontend/client/src/pages/Home.tsx` — montage direct de LABBENCH dans l’onglet Home.
- `frontend/client/src/pages/LabBench.tsx` — contrat d’intégration et classe de rendu native.
- `frontend/client/src/pages/labbench.css` — layout intégré sans modal ni seconde application.
- `frontend/client/src/App.tsx` — alias historique `/labbench` vers Home.
- `frontend/client/public/manus-routes.json` — manifeste des routes servi par le frontend.
- `app.config.ts` — logo de projet WebDev.
- `plan.md`, `TODO.md` — décisions et critères de livraison mis à jour.

## Validation

- `pnpm install --frozen-lockfile` : réussi.
- `pnpm check` : réussi ; 2 617 clés i18n synchronisées.
- `pnpm test` : réussi ; 54 fichiers et 273 tests passés.
- `pnpm build` : réussi après le dernier verrouillage ; avertissement non bloquant sur la taille de quelques chunks Vite.
- `GET /manus-routes.json` : HTTP 200, JSON valide.
- Preview capturée sur `/`, `/?view=labbench` et `/labbench`, y compris en pleine page.

## Prévisualisation

URL Preview : https://8328-ic6ir8ynwosotil0a0yix-32036608.us3.manus.computer

La Preview fonctionne avec le serveur de développement sur le port 3000. La publication publique n’a pas été déclenchée ; cette livraison demande l’archive source et une URL de prévisualisation.
