# AEROMIND — Rapport consolidé de phase 2

**Date :** 1 novembre 2026  
**Périmètre :** habilitations, privilèges Super-Administrateur, cohérence UI/API, disponibilité des fonctions virtuelles, accès matériels, preview, dette de jeton mission et télémétrie Sentry.  
**Mode :** audit statique et sondes de la preview isolée. Aucune commande réelle, SITL, connexion drone, publication production ou écriture de code applicatif n’a été exécutée pendant cette phase.

## 1. Synthèse exécutive

Les trois corrections de la phase 1 restent en place : état N3 calculé depuis le dernier état courant, gates G0–G5 fail-closed, et séparation du protocole mission de `COMMAND_LONG`. Les preuves et tests de la phase 1 sont dans [le rapport d’audit correctif](AEROMIND_AUDIT_CORRECTIF_2026-11-01.md).

La phase 2 a révélé deux risques d’habilitation à traiter avant d’exposer une instance avec comptes privilégiés : les mutations du pont tRPC sont accessibles par GET et celui-ci est exclu du middleware CSRF; et le rôle Super-Administrateur est dérivé de l’adresse e-mail configurée plutôt que d’une liaison immuable tenant/subject démontrée dans ce dépôt. Le point d’accès local `dev-login` remet également une session Super-Administrateur en environnement `development`. Pour sécuriser la preview, son processus a été redémarré en `staging`, Sentry vide et `AEROMIND_VIRTUAL_ONLY=true`; `dev-status` répond `false` et `POST /api/auth/dev-login` répond 403. **Aucun correctif source de ces risques d’architecture n’a été appliqué** : ils sont soumis à décision et revue, les changements d’habilitation pouvant affecter la gouvernance et les parcours existants.

Les fonctions virtuelles restent disponibles selon leurs parcours existants. **Aucune fonctionnalité matérielle réelle n’a été restaurée ni utilisée**. La preview testée reste un relais sandbox temporaire, pas une Preview WebDev gérée stable.

## 2. Travaux réalisés et preuves

- Audit indépendant en lecture seule de l’authentification, du RBAC, des routes UI/API, des états de commandes, du helper mission et de Sentry; aucun fichier applicatif modifié dans cette phase.
- Preview reconfigurée au runtime avec `AEROMIND_ENV=staging`, `SENTRY_DSN` vide, `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et SITL désactivé. `/` répond 200, `/api/ready` indique `ready=true` et `mode=simulation`, `devLoginAvailable=false`, `POST /api/auth/dev-login` répond 403. `/api/hardware/status` confirme `virtualOnly=true`, `allowedCommands=[]`, `physicalOutputEnabled=false` et `physicalCommandsEmitted=false`.
- Aucun test automatisé n’a été relancé dans cette phase afin d’éviter toute nouvelle tentative de télémétrie non voulue. Les résultats antérieurs restent : 76 tests backend ciblés, 75 fichiers/363 tests frontend, build réussi; le rapport de phase 1 précise l’avertissement de bundles volumineux et l’incertitude sur la livraison d’un événement Sentry.
- Le dépôt livré ne comporte pas de métadonnées Git exploitables; l’historique institutionnel ou un diff d’origine ne peut donc pas être certifié à partir de cette copie.

## 3. Chaîne d’habilitation et constats prioritaires

### P1 — Mutations tRPC par GET et protection CSRF incomplète

`web/app.py:678–706` accepte GET et POST pour `trpc_compat`; les mutations administratives sont dispatchées sans vérification de méthode dans `web/app.py:770–835`. Exemples : création, modification, suppression de compte, réinitialisation/rotation des droits et suppression de projet. Le middleware CSRF ne protège que POST/PUT/PATCH/DELETE et exclut explicitement `/api/trpc` (`web/app.py:297–328`). Les écritures par GET ne reçoivent donc pas ce contrôle. En environnement HTTPS, le cookie principal est configuré `SameSite=None; Secure` (`web/oidc.py:131–135`); une action intersite sur une session privilégiée doit être considérée comme un risque, même si l’exploitabilité effective dépend de la configuration navigateur et de la session.

**Recommandation :** dresser la liste formelle des queries et mutations, rejeter toute mutation en GET (405), et appliquer à toutes les mutations authentifiées par cookie une protection CSRF explicite (double-submit ou contrôle d’origine robuste tenant compte du proxy Preview). Maintenir les mutations POST et leurs fonctionnalités. Les mutations de l’interface utilisent des hooks `useMutation` (`frontend/client/src/pages/SuperAdmin.tsx:180–251`), mais le changement doit être couvert par tests client/serveur avant livraison.

### P1 — Connexion de développement privilégiée

`POST /api/auth/dev-login` ne fonctionne qu’en `AEROMIND_ENV=development` (`web/app.py:520–529`), mais crée une session du Super-Administrateur principal sans OIDC (`:533–550`); une note de code signale l’absence de limitation de débit (`:527`). C’est une facilité locale, pas un mécanisme adapté à une Preview publique. **Mitigation effectuée pour cette preview seulement :** runtime staging, route refusée 403, aucune modification au comportement de développement du code source.

**Recommandation :** avant toute exposition d’un environnement `development`, décider d’un opt-in explicite, d’une restriction de portée locale/isolée et d’un rate limit; conserver le parcours local uniquement si la gouvernance l’autorise.

### P1 — Attribution du rôle Super-Administrateur par e-mail

Le rôle est promu à `super_admin` lorsque l’adresse est dans la configuration (`web/oidc.py:171–180`, `web/config.py:52–59`; le helper serveur est `web/app_auth_helpers.py`). Le code observé ne démontre pas une liaison stable de cette habilitation à un `sub` OIDC immuable et un tenant Entra précis, ni l’exigence d’un claim e-mail vérifié dans la configuration d’exploitation. La preview indique `oidc=not_configured`; aucune vérification de l’identité institutionnelle réelle ou de la configuration Entra de production n’a été possible.

**Recommandation :** faire valider par le propriétaire institutionnel l’ancrage de l’identité Super-Administrateur (issuer/tenant + subject immuable, e-mail comme attribut de contact), la procédure d’ajout/remplacement et la revue indépendante. Ne pas changer arbitrairement l’administrateur configuré.

### P2 — Défense en profondeur des fonctions d’administration

Plusieurs fonctions ordinaires de mutation dans `web/admin.py` reçoivent un `actor`, mais le contrôle Super-Administrateur est surtout effectué par le dispatcher tRPC; les fonctions dédiées de gestion super-admin répètent davantage leur contrôle (`web/admin.py:392–399`). Les routes observées protègent leurs opérations, mais un nouvel appel interne pourrait contourner le garde du dispatcher.

**Recommandation :** ajouter un contrôle d’acteur dans chaque fonction de mutation ou un service central, avec tests directs d’appel/refus, sans changer les droits fonctionnels actuels.

### P2 — Audit fail-open pour certaines décisions LabBench

Le journal de décision utilise une chaîne de hachage (`web/labbench_auth.py:355–387`), mais le chemin documenté absorbe certaines erreurs de journalisation et ne conditionne pas nécessairement l’action à une écriture durable (`:341–346, 390–393`). Une chaîne de hachage n’équivaut pas à une immutabilité face à un opérateur de base de données.

**Recommandation :** décider quelles actions privilégiées doivent échouer si leur événement d’audit ne peut pas être enregistré; définir transaction, rétention et accès DB avec le responsable d’Aeromind.

### P2 — Le statut hardware ne sépare pas assez implémentation et disponibilité

`GET /api/hardware/status` déduit `allowedCommands` et `allowedModes` seulement de `virtualOnly` (`web/app.py:1664–1677`), alors que `hardwareControlEnabled` dépend aussi de `HARDWARE_CONTROL`. Si `virtualOnly=false` mais que le contrôle est désactivé, la réponse peut lister des commandes tout en affirmant que le contrôle n’est pas activé. La preview actuelle évite cette ambiguïté en retournant `virtualOnly=true` et une liste vide. Le panneau virtuel utilise pour sa part `/api/capabilities` et les endpoints `/api/control/*` (`frontend/client/src/components/HardwareControlPanel.tsx`, `web/hardware_api.py`), qui restent distincts du pilote MAVLink.

**Recommandation :** séparer les champs « implémentées dans le code » et « actuellement disponibles/configurées », ou ne retourner les commandes effectives que si tous les drapeaux runtime les autorisent. Ce changement d’état descriptif ne devrait pas supprimer la liste d’implémentation ni activer de sortie.

## 4. Fonctionnalités disponibles, virtuelles et non disponibles

| Domaine | État documenté / observé | Limite à ne pas confondre |
|---|---|---|
| Éditeur paramétrique, planification et optimisation de mission | Disponibles côté logiciel; édition/planification locale, visualisation de trajectoire et simulation | Le plan local n’est pas un téléversement vers un aéronef |
| Flight Command Deck | Contrat limité à `simulation`; actions de scénario telles que départ, waypoint, maintien, RTL et atterrissage simulés (`aircraftControlBoundary.ts`, `FlightCommandDeck.tsx`) | Aucun actionneur ou pilote réel n’est sollicité |
| Centre de commande | Simulation serveur persistée avec états préparés/en attente/approbation/exécution simulée et ACK synthétique (`web/command_center.py`) | L’ACK simulé ne prouve ni transmission ni réponse d’un drone |
| LabBench / N2 | Simulations, revue et états de gate; service de contrôle déclaré virtuel | Statut/gates simulés ne constituent pas une autorisation de vol ou une preuve d’essai matériel |
| Panneau `/api/control/*` | Contrôle de modèle virtuel local ou session virtuelle serveur; endpoint refuse explicitement `HARDWARE` (`web/hardware_api.py:21–50, 99–139`) | « Armé » est un état du modèle virtuel, pas un drone armé |
| Pilote MAVLink et protocole mission dédiés | Un chemin matériel existe dans le code et est conditionné par flags, autorisations, jetons, géofence et contexte; transfert mission distinct de `COMMAND_LONG` | Non activé, non testé sur véhicule, aucune transmission réelle faite dans cette phase; exécution future exige une autorisation distincte et revue indépendante |
| Preview actuelle | Staging, API prête, OIDC non configuré, login de développement refusé, Sentry vide, sortie matérielle fermée | Relais sandbox temporaire; disponibilité non garantie à long terme et aucune authentification institutionnelle réelle testable |

Les trois corrections de sécurité de phase 1 ne désactivent pas les simulations indépendantes. La seule restriction permanente du panneau `/api/control` concerne le matériel réel; elle ne doit pas être confondue avec l’existence conditionnelle du pilote MAVLink séparé.

## 5. Dettes techniques demandées

### `_issue_mission_item_token`

Le helper est défini une seule fois dans `web/mission_planner.py:589–607` et aucun appel statique n’a été trouvé. Il construit un jeton `MISSION_ITEM_INT` par waypoint, avec `reviewer_id=actor_id`; la validation d’émission interdit l’identité acteur=reviewer (`web/labbench_auth.py:424–449`). Il est donc incohérent avec lui-même et avec le flux actuel, qui consomme un jeton unique `MISSION_UPLOAD` lié à des paramètres vides (`web/mission_planner.py:365–374`). **Aucune suppression ou réorientation n’a été faite.** Décision : le retirer après confirmation qu’aucun consommateur externe/dynamique ne l’importe, ou le garder marqué obsolète jusqu’à une future refonte institutionnellement approuvée du protocole de jetons mission.

### Sentry

`web/app.py:108–118` initialise l’intégration FastAPI si `SENTRY_DSN` est non vide, avec un taux de traces de 10 %. L’état d’ops n’indique que la présence de la variable (`web/ops_control_api.py:184`), pas l’initialisation ou la livraison. Pendant la suite backend de la phase 1, le SDK a affiché une tentative de vidage d’un événement. **Le type, le contenu, la destination et la réception ne sont pas établis**; le DSN n’a pas été affiché ni inclus dans les livrables. La preview tourne maintenant avec DSN vide. Décision : confirmer la politique institutionnelle de télémétrie (environnements permis, données à filtrer, tests opt-out, échantillonnage/rétention); ne pas désactiver la télémétrie de production sans accord.

## 6. Décisions requérant approbation

1. Autoriser le correctif tRPC : mutations exclusivement POST, CSRF pour toute mutation portant une session cookie, liste canonique query/mutation et tests de non-régression.
2. Valider la source de vérité du Super-Administrateur : issuer/tenant/subject immuable, claim vérifié et procédure de délégation/révocation.
3. Définir si et comment le `dev-login` peut rester accessible en développement local (opt-in, isolation et limitation de débit).
4. Valider le niveau d’audit fail-closed et les droits de rétention/suppression du journal privilégié.
5. Décider du nettoyage ou de la refonte de `_issue_mission_item_token`, après confirmation de l’absence de consommateurs externes.
6. Valider la politique Sentry et l’investigation de l’événement possiblement tenté; la réception externe demeure inconnue.
7. Choisir un espace/projet WebDev géré dédié pour une Preview stable, sans déplacer le dossier Aeromind actuel; aucune publication production n’est proposée.
8. Toute activation matérielle future requiert une validation séparée, autorité humaine explicite, revue indépendante des garde-fous et responsabilités humaines; aucune décision de ce type n’est présumée ici.

## 7. Limites de l’audit

Analyse statique partielle, sondes HTTP limitées à la preview de sandbox et revue indépendante par plusieurs axes. Pas de test OIDC/Entra, de test de pénétration, de test navigateur d’attaque CSRF, de connexion matériel/SITL, de migration, de revue complète de tous les endpoints ni de vérification de production. Les constats décrivent le code et la preview observés, pas une certification de conformité ni une autorisation opérationnelle.

## 8. Transparence — fenêtre initiale de preview en development

Avant la découverte du chemin `dev-login`, l’API de preview a fonctionné temporairement avec `AEROMIND_ENV=development` derrière le relais HTTPS. Dans cette configuration, `POST /api/auth/dev-login` aurait pu créer une session locale Super-Administrateur; Sentry était également initialisé. Le service a été arrêté dès le constat et redémarré en `staging`, avec `SENTRY_DSN` vide. Le test actuel confirme le refus 403 de `dev-login`.

Les lignes de console locales conservées montrent les sondes de santé, readiness, statut matériel et manifeste; aucun appel à `dev-login` n’y apparaît. Elles ne constituent pas une journalisation exhaustive des accès du relais et aucune analyse forensique complète de la base/logs n’a été faite : un accès tiers antérieur ne peut donc pas être exclu. La base de preview était SQLite locale temporaire et les réponses matérielles observées sont restées `virtualOnly=true`, `physicalOutputEnabled=false`, `physicalCommandsEmitted=false`; aucun essai physique n’a eu lieu. Pour Sentry, le démarrage confirme l’initialisation précédente, mais ni un événement précis ni sa réception ne sont établis.

Le redémarrage staging a aussi généré un nouveau `AEROMIND_SESSION_SECRET` aléatoire; les jetons signés par l’ancien processus ne sont donc plus valides. Cela réduit le risque de rejeu d’une session antérieure, sans établir l’absence d’accès ou de modifications durant la fenêtre précédente.
