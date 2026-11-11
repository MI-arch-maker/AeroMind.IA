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

## Extension — Centre Mécanique, filerie et intégration drone

Le Centre Mécanique est ajouté comme une vue native distincte du Centre Paramétrique, du Digital Twin et de l’atelier de construction. Il réutilise les modèles mécaniques et le `ConceptConfig` existants, puis ajoute un contrat documentaire pour la structure, l’installation, les câbles, les connecteurs et la maintenance.

La vue adopte un atelier de contrôle industriel sombre : rail de modules, tableau d’intégration central, inspecteur contextuel, badges de provenance et alertes explicites. Les métriques de masse, longueur, compatibilité et routage restent indicatives tant qu’elles ne sont pas rattachées à une source vérifiée. Le Centre ne déclenche aucune fabrication, commande, connexion, émission ou certification.

Le bloc de configuration est synchronisé avec les snapshots projet existants. Les contrôles de séparation de câbles, de connecteurs incomplets, de pièces non installées et de maintenance échue sont des contrôles de cohérence documentaire; ils ne remplacent ni une revue mécanique, ni une analyse structurelle certifiée, ni une procédure institutionnelle.

## Extension turbo — atelier d’assemblage

Le Centre Mécanique comprend désormais un atelier manuel de création de pièces documentaires, un espace d’assemblage par contraintes, un registre de visserie et un atelier de graissage. Les contraintes peuvent être déclarées comme contact, concentricité, parallélisme ou relation à vérifier. La visserie conserve le type, la taille, le matériau, la quantité, le couple indicatif et l’état de montage. Les points de graissage conservent la cible, le produit à préciser, la quantité, l’intervalle et l’accessibilité.

Cette extension reste volontairement dans la frontière virtuelle : elle ne constitue pas un modeleur industriel B-Rep, un solveur de résistance, une certification de couple, une procédure de lubrification constructeur ou une commande de fabrication.

## Extension — Aerodynamic Simulation Center (3 novembre 2026)

### Approche et architecture

Le Centre aérodynamique sera monté dans la coque React/TypeScript/Vite existante, dans `frontend/client/src/pages/Home.tsx`, avec un identifiant de vue dédié exposé par `/?view=aero-cfd`. Un composant spécialisé `frontend/client/src/components/AerodynamicSimulationCenter.tsx` et un module pur de calcul/validation sépareront l’interface, les estimations et la préparation de cas. `App.tsx` reste propriétaire du routage SPA, et `frontend/client/public/manus-routes.json` sera tenu à jour avec toutes les vues déclarées réellement. Les états locaux (scénarios, imports décrits, historiques locaux) resteront explicitement locaux tant qu’aucune persistance serveur n’est raccordée.

Réutiliser les modèles de configuration, fonctions d’import et calculs analytiques déjà livrés dans `frontend/client/src/lib/`, notamment le calcul aérodynamique simplifié existant. Importer et afficher les géométries seulement avec les capacités de lecture réellement testées; garder les fichiers sources intacts, signaler les formats qui sont reçus sans parseur vérifié, et préciser unités, dimensions et défauts effectivement détectés. Les vues de champs et lignes de courant sont des visualisations de données disponibles ou des illustrations clairement nommées; elles ne deviennent jamais des résultats CFD par animation seule.

Les conditions d’essai (flux, ambiance, fluides, turbulence et limites), génération de maillage, scénarios, historique et rapports sont réutilisés/ajoutés dans une interface intégrée. Les grandeurs calculées par modèle conceptuel/analytique portent cette provenance, les hypothèses, l’incertitude et les limites. Le mode rotor/propulsion est présenté comme analyse simplifiée lorsque les données ne viennent pas d’un solveur. Le mode atmosphérique distingue explicitement la pression ISA dérivée de l’altitude de la pression statique manuelle; toute saisie explicite bascule en mode manuel, sans mélange silencieux.

Le générateur de cas OpenFOAM existant et/ou son contrat de préparation sera exposé clairement; un cas exporté n’est pas un calcul achevé. Aucun exécutable OpenFOAM, runtime solver ou service CFD n’est disponible dans cette session. Comme approuvé par l’utilisateur, l’intégration d’exécution OpenFOAM est explicitement différée à un raccordement ultérieur. L’interface indiquera le solveur indisponible et ne produira aucun faux statut de convergence ou résultat CFD. Aucun solveur distant ne sera inventé, aucune clé n’est supposée.

### Structure des changements

- `frontend/client/src/pages/Home.tsx` : état, entrée de navigation et montage de la vue `aero-cfd` reliée au projet actif.
- `frontend/client/src/components/AerodynamicSimulationCenter.tsx` et feuille CSS dédiée : import/inspection, paramètres, scénarios, analyse, résultats disponibles, historique, comparaison et exports.
- `frontend/client/src/lib/aerodynamicWorkspace.ts` : validation d’entrées, calculs analytiques étiquetés, format des scénarios et contrats/export de rapport/cas.
- `frontend/client/public/manus-routes.json` : route de vue `/` avec le paramètre `view=aero-cfd`, sans inventer de routes métier.
- `TODO.md` et ce plan : critères explicites, statut de la CFD réelle différée et limites vérifiables.
- `tests/` et les checks existants : tests des calculateurs/valideurs purs, typecheck, build, suites pertinentes.

### Direction visuelle conservée

Réutiliser le style existant de poste d’ingénierie sombre AeroMind; aucun nouvel habillage de marque. Graphite profond pour le plan de travail, cyan AeroMind pour géométrie et actions principales, ambre pour incertitude/limite et rouge uniquement pour erreur. Disposition en navigation de laboratoire, zone de visualisation centrale, paramètres et provenance latéraux; typographie Inter avec libellés techniques monospace. Microcopie précise (« Estimation analytique — pas une CFD », « Cas prêt à exporter — solveur non connecté »). Les interactions doivent préserver la configuration, signaler les opérations refusées, les résultats non validés et la provenance; les transitions sont discrètes et ne suggèrent pas une mesure réelle.

### Capacités et limites

La Preview est un environnement Webdev de développement, sur port 3000, et le ZIP sera nettoyé des secrets, environnements virtuels, dépendances installées, bases locales et builds. La préparation/export d’un cas OpenFOAM est distincte d’un solveur actif. Le livrable n’attestera ni CFD réelle exécutée, ni qualification expérimentale, ni certification. Les besoins STEP/3MF/format CAD sans parseur/convertisseur testé seront signalés comme non décodés plutôt que faussement « analysés ».


## Extension — Aeromind Intelligence Center (3 novembre 2026)
Le projet conserve sa coque React/TypeScript/Vite, son mode VIRTUAL ONLY et ses centres d’ingénierie existants. Une vue native `intelligence-center` ajoute une salle de contrôle multi-agents sans déplacer la source de vérité des conceptions. Le composant `AeromindIntelligenceCenter` porte un état local versionné pour l’interface de démonstration et distingue explicitement faits vérifiés, hypothèses, recommandations et actions en attente d’approbation.

Le workspace contient le Master AI Dashboard, une conversation routée vers huit agents spécialisés, un graphe de tâches, une mémoire technique filtrable, un comparateur de décisions, un moteur d’amélioration continue, le routage de modèles avec repli déterministe, l’historique et la gouvernance par niveaux. Les actions de démonstration sont opérationnelles côté interface : création de missions, distribution, consolidation, import documentaire en quarantaine, approbation/refus humain, commutateurs de gouvernance, export indirect vers les centres existants et réinitialisation du workspace. Aucune clé n’est embarquée dans le client et aucune modification silencieuse de conception n’est réalisée.

La route est exposée par `/?view=intelligence-center`, reliée à la navigation Home et au manifeste `manus-routes.json`. La prévisualisation utilise le serveur FastAPI/Vite existant sur le port 3000; les vérifications couvrent typecheck, tests Vitest, build Vite, manifeste de routes, santé API et commandes principales du workspace.

## Session corrective — Modernisation Aeromind (3 novembre 2026)

Cette session reprend la source fournie sans reconstruire l’application. Le frontend React/TypeScript/Vite reste servi par FastAPI sur le port de Preview configuré (3000); le runner `start.sh` garde SQLite locale de démonstration, `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false` et l’autostart SITL coupé. La base managée n’est pas activée. Les corrections visent les défauts statiques confirmés : résolution de toutes les vues déclarées (y compris `fleet-maintenance` et `control-center`), attente effective de l’hydratation avant sauvegarde anonyme, statut de persistance non trompeur, et envoi du jeton CSRF présent à toute mutation VIRTUAL. Le manifeste existant `frontend/client/public/manus-routes.json` est conservé et vérifié contre les routes SPA et paramètres `view` réels.

Les actions du jumeau logiciel restent fonctionnelles et explicitement qualifiées de simulation. Cette archive ne suffit pas à qualifier un aéronef, un actionneur, un transport, un réseau de sécurité, un dispositif d’arrêt indépendant ou un processus d’autorisation institutionnel; aucune émission matérielle ni ouverture de MAVLink, HIL ou SITL n’est effectuée dans cette livraison. La microcopie peut éviter la formulation demandée par le cahier des charges, mais ne peut pas masquer le fait qu’une action est seulement simulée. La validation porte sur typecheck, tests unitaires frontend/build, et suites backend sans transport matériel. La livraison comprend une archive source nettoyée et la Preview WebDev; aucune publication de production, base distante ou activation matérielle n’est visée.


## Tranche — Centre de supervision et gouvernance des consoles (10 novembre 2026)

La Console Super-Admin remplace les indicateurs déclaratifs par une sonde backend authentifiée qui vérifie la disponibilité API, exécute `SELECT 1` contre la base et rapporte les paramètres de gouvernance utiles. Les données exposées ne contiennent ni URL gateway ni secret LLM. Le navigateur renouvelle la sonde toutes les 30 secondes et peut la relancer à la demande; cette périodicité ne lance aucune complétion payante ni commande physique. L’état LLM affiché signifie uniquement « configuration complète/incomplète/non sélectionnée »; la validation de connectivité demeure un test explicite distinct dans la Console Admin.

Le journal Super-Admin ajoute une recherche par texte, acteur/cible, type, période, une pagination de l’échantillon le plus récent fourni par l’API et un export CSV des seules métadonnées d’audit affichées, avec échappement des cellules. Le panneau L1–L5 explique les familles de capacités déjà définies par `web/capability_policy.py`; il n’ajoute aucune autorisation et rappelle que le backend, les périmètres propriétaires, les rôles et interverrouillages restent obligatoires.

Aucune écriture de projet, élévation d’accès, purge automatique, activation matériel, changement de mode ou appel LLM ne découle de ces panneaux. La validation porte sur les tests Python ciblés, typecheck/i18n, tests frontend et build; aucune mise en production ni migration distante n’est implicite.


## Tranche approuvée — combinaison des consoles (11 novembre 2026)

Le client approuve la combinaison des trois pistes visuelles : poste de commandement d’ingénierie virtuelle, workspace Admin L4 à périmètre propriétaire, et plan de contrôle Super-Admin L5. L’intervention modernise les pages existantes sans les supprimer ni réécrire le backend : `frontend/client/src/pages/AdminConsole.tsx` avec `admin-console.css`, et `frontend/client/src/pages/SuperAdmin.tsx` avec `super-admin.css`. Elle réutilise les composants et endpoints déjà présents (santé, modes, capacités, approbations, registres, audit, opérations de session et validation explicite du gateway LLM).

Le langage visuel commun est une interface d’ingénierie aéronautique institutionnelle : cadre bleu nuit, surfaces titane/claires, accents cyan/ambre mesurés, navigation de contrôle dense mais hiérarchisée, hiérarchie visuelle orientée propriétaire et sécurité. La Console Admin montre uniquement son workspace déjà autorisé, les métadonnées personnelles et des accès vers le parcours d’ingénierie virtuelle existant. La Console Super-Admin reste l’unique surface de vision globale; la matrice L1–L5 et les étapes G01–G05 expliquent la gouvernance et orientent vers les modules réellement implémentés, sans fabriquer d’état de gate.

Chaque bouton ajouté doit effectuer une navigation, une sélection locale, une exportation sûre ou un appel à un endpoint existant. Les valeurs affichées proviennent de l’API réelle ou sont explicitement informatives; aucun faux statut d’exécution, compte de test ou commande décorative. Les contrôles d’identité, les permissions backend, la séparation des cookies, les politiques de propriétaire, les actions déjà en place et la compatibilité responsive sont préservés. Pas de connexion automatique, de cellule/drone créé à l’ouverture, de paiement, d’appel LLM périodique ou de sortie matérielle; les changements de gouvernance restent soumis à leurs fonctions existantes et aux validations humaines prévues.


Limite d’intégration ajoutée à la frise Super-Admin : le lien `/?view=mission-center` ouvre le cockpit existant et son workflow G01–G05 en **simulation locale**; la frise ne présente aucun statut de dossier live. L’API FastAPI `/api/institutional` n’est pas modifiée ni raccordée à cette vue, car ses routes exigent une `StepUpSession` liée à un projet. Aucune session administrative ne contourne ce contrôle, et GATE 05 ne constitue toujours pas une autorisation matérielle.


## Correction visuelle après retour client — 11 novembre 2026

Le retour client confirme que l’intégration précédente ne ressemblait pas au choix A+B+C. Cause reconnue : des accents, raccourcis et une frise ont été ajoutés sans remplacer la composition générique centrée en cartes par les vraies architectures des trois références. La correction porte d’abord sur la disposition JSX/CSS; aucune nouvelle maquette ni palette isolée ne se substitue aux images validées.

- **ADMIN — base visuelle B, densité de contrôle A :** application plein écran; rail vertical bleu nuit; bandeau supérieur clair montrant le périmètre Admin L4, l’identité et les commandes de session; zone de travail à trois colonnes (registre/arborescence à gauche, aperçu conceptuel central, inspecteur à droite); bande inférieure dédiée aux actions navigables, à la revue technique et aux activités qui existent effectivement. La frise G01–G05 est un parcours informatif/nav, sans fausse file d’approbation.
- **SUPER-ADMIN — base visuelle C, densité de contrôle A :** bandeau horizontal bleu nuit et rail de gouvernance vertical; matrice L1–L5 occupant la surface primaire à côté du panneau d’isolation propriétaire/tenant; dessous, deux panneaux réels approbations et audit; en partie basse, frise G01–G05 informative et état du gateway interne uniquement si fourni par un contrôle backend authentifié. Les routes, rôles et sessions existants demeurent les sources de vérité.
- **Fidélité et interactions :** retrouver l’échelle, l’ordre, le ratio des panneaux, les fonds bleu nuit/titane, les séparateurs cyan et l’usage mesuré de l’ambre des images originales. Supprimer, sur ces deux écrans, le motif précédent de grandes cartes centrées 1440 px avec une frise ajoutée dans un onglet à part. Tout panneau n’utilise que ses données réellement disponibles; aucun chiffre, dossier, risque, inventaire de matériau ou statut fictif. La vue 3D reste strictement conceptuelle et non persistante; ne pas créer de drone au montage de page.
- **Préservation :** conserver le FastAPI, endpoints, hooks, rôles, isolement propriétaire, step-up, login/logout/veille, tests et navigation. Réorganiser les contrôles existants dans les compositions; ne pas remplacer ni réécrire le système.
