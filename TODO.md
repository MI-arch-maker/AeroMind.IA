## Demande — intégration des laboratoires Simulation & analyses / Essai & scénarios

- [x] **Source unique projet :** le laboratoire panoramique, le laboratoire spatial et Mission Control lisent le même `ConceptConfig`, les exigences et le résultat du moteur AeroMind.
- [x] **Scénario actif partagé :** les cinq scénarios (stationnaire, trajectoire, vent latéral, obstacles, retour) sont sélectionnables depuis les laboratoires et leur sélection se reflète dans Mission Control, la télémétrie et les analyses.
- [x] **Lancer l’essai :** l’action applique la configuration du scénario sélectionné puis déclenche le recalcul global avant la lecture virtuelle.
- [x] **Paramètres projet :** le vent latéral, la comparaison de résultats, la position de départ, le cap de référence et les options d’affichage restent dans la configuration du projet et sont persistés avec le snapshot.
- [x] **Limites :** les laboratoires restent virtuels et synthétiques ; aucune commande physique, liaison d’actionneur ou preuve d’essai réel n’est ajoutée.
- [x] **Validation finale :** typecheck, tests Vitest et build statique exécutés sur le code modifié; tous ont réussi.

## Demande — synchronisations et arborescence d’atelier (22 octobre 2026)

- [x] **État sincère :** ne pas présenter READY quand des modules sont `partial` ou `waiting`; refléter les liaisons incomplètes au niveau global.
- [x] **Arborescence logique :** rendre visible l’ordre Projet → Cellule/configuration → Exigences → Conception/version → Vérification → Rapports/audit, avec un état par branche.
- [x] **Audit des limites :** distinguer propagation locale/cross-tab, snapshot serveur, workflow immuable, LABBENCH et audit; documenter l’absence de conflit serveur compare-and-swap pour les sauvegardes concurrentes.
- [ ] **Synchronisation concurrente multi-poste :** introduire ultérieurement une révision serveur atomique et une politique explicite de conflit/fusion; la présente modification ne change aucun contrat de stockage partagé.

## Demande — LABBENCH 01 fonctionnel et mécanique strictement virtuelle (22 octobre 2026)

- [ ] **LABBENCH 01 :** corriger les erreurs d’affichage Web et compléter les contrats de statut, référentiel, simulation, rapports et audit ; rendre les écrans utilisables avec un projet local ou authentifié sans présenter un brouillon comme preuve serveur.
- [ ] **Fonctions mécaniques virtuelles :** débloquer diagnostic, consignes et armement simulés ; maintenir toutes les sorties physiques interdites, y compris en cas de variable matérielle activée.
- [ ] **Contrôle humain renforcé :** exiger des validations explicites distinctes avant une action virtuelle supervisée, borner les paramètres et permettre un arrêt immédiat qui annule les autorisations sans reprise automatique.
- [ ] **Préservation :** conserver l’identité visuelle, les projets, l’authentification, le Twin, les laboratoires de vol et la synchronisation existants ; vérifier les changements avec les suites TypeScript, Vitest et Python et livrer l’archive source corrigée.

## Demande — intégration native et vérité des données LABBENCH 01 (28 octobre 2026)

- [x] **Onglet natif :** LABBENCH est monté par `Home` au même niveau que Vue d’ensemble, Bibliothèque des cellules et Simulation ; l’URL historique `/labbench` est un alias de la même coque et ne charge plus une interface détachée.
- [x] **Source de vérité commune :** Home transmet le projet, la cellule active et le `ConceptConfig` au LabBench intégré ; le nom du projet et la cellule active sont visibles dans l’en-tête LABBENCH.
- [x] **Données utilisateur uniquement :** les anciens scénarios localStorage sont ignorés, le nouveau stockage est marqué `source: user`, et tout calcul exige une saisie explicite ou une donnée de cellule/dessin réellement intégrée.
- [x] **État vide sans tromperie :** lorsqu’aucune donnée utilisateur n’est disponible, LABBENCH affiche un état vide exploitable et ne montre ni télémétrie, ni température, ni verdict, ni identité d’émulateur ou valeurs hardware fictives.
- [x] **Synchronisation des commandes et calculs :** les entrées de scénario et l’état de run restent liés à la vue intégrée ; les actions de calcul refusent les valeurs par défaut et les résultats distinguent les runs utilisateur des données non exécutées.
- [x] **Traçabilité institutionnelle :** les libellés de source, d’état de run, de calcul local et de transport virtuel restent visibles ; les sorties physiques demeurent verrouillées.
- [x] **Validation finale de livraison :** dépendances installées depuis le lockfile ; typecheck/i18n réussis (`2617` clés synchronisées), Vitest réussi (`54` fichiers, `273` tests), build Vite réussi, manifeste `/manus-routes.json` servi en `200`, Preview démarrée sur le port `3000` et accès `/labbench` capturé avec le rendu intégré.

## Modernisation Aeromind — navigation satellite, accès MFA et LABBENCH 01 (29 octobre 2026)

- [x] **Navigateur par satellite :** corriger l’interface « NAVIGATEUR PAR SATELLITE » qui ne fonctionnait pas, refusait de s’ouvrir sur HTTPS et envoyait un message d’erreur d’affichage; prévenir le blocage de contenu mixte et stabiliser le repli entre fournisseurs de tuiles.
- [x] **Connexion MFA AeroMind :** au-delà de l’onglet « CONNEXION SUR MICROSOFT ENTRA » retrouvé sur l’application AeroMind, créer juste en dessous l’onglet « CONNEXION MFA », également disponible sur l’interface admin; réutiliser le flux local MFA existant avec mot de passe et TOTP.
- [x] **LABBENCH 01 :** moderniser les onglets et contrôles de connexion visibles dans LABBENCH 01 sans changer les règles d’autorisation Step-up.
- [x] **Validation & livraison :** typecheck/i18n, tests frontend et build exécutés; archiver les sources corrigées et documenter l’état de déploiement.

## Modernisation AeroMind — Centre Parametric et Poste de commande virtuel (1 novembre 2026)

- [x] **Centre Parametric — contrats et sauvegarde :** conserver les modules et l’identité AeroMind; valider les snapshots Mechanical Twin à l’aide d’un contrat versionné; refuser les entrées incorrectes au lieu de les remplacer par un workspace vide; ne déclarer la sauvegarde confirmée qu’après l’accusé réel du stockage disponible; conserver `physicalOutputEnabled=false`.
- [x] **Centre Parametric — sélection, variables et réversibilité :** l’arbre, le viewport et l’inspecteur ciblent l’ID stable de la pièce sélectionnée; le matériau et les modifications restent limités au design/pièce actif; les débattements sont persistés; une réinitialisation restaure les pièces sources et leur visibilité et reste annulable. Les variables personnalisées ont des valeurs, types, unités, plages et dépendances validés; leurs expressions utilisent un évaluateur arithmétique limité sans `eval`, rejettent les cycles et valeurs non finies; l’historique annule les changements pris en charge.
- [x] **Centre Parametric — opérations et vérité des formats :** les actions affichées correspondent au moteur de géométrie réellement livré; les opérations refusées ne sont jamais présentées comme réussies; fillets/chanfreins exacts, noyau B-Rep industriel, STEP/IGES/DXF/3MF/GLB ou plans ne sont pas revendiqués sans encodeur et preuve vérifiés; CSV/JSON servent aux données couvertes et OBJ/STL aux maillages pris en charge; toute approximation, limite topologique ou métrique proxy est explicitement étiquetée.
- [x] **Centre Parametric — vues et modules :** Part Studio, Variable Studio et Assembly sont des vues distinctes; les limites d’un assemblage sans solveur sont annoncées; les vues déclarées dans Home s’ouvrent directement par `/?view=<id>`, les alias historiques et routes publiques sont conservés, les valeurs inconnues retombent sur la vue générale, et `GET /manus-routes.json` sert un vrai manifeste JSON synchronisé avec le code.
- [x] **Poste de commande — mode logiciel strict :** le poste de commande et les écrans LabBench concernés restent en simulation/VIRTUAL ONLY; aucun SITL n’est démarré automatiquement; aucun lien physique, transport MAVLink, connexion WSS externe, HIL, commande physique, émission d’actionneur ou téléversement matériel n’est ouvert dans cette distribution. Le verrou vaut même si `HARDWARE_CONTROL=true`; les entrées et actions dangereuses sont désactivées côté interface et les endpoints backend refusent l’action avant l’accès au pool, au jeton ou au transport. Les contrôles VIRTUAL restent des simulations, et un arrêt matériel indisponible n’est pas présenté comme E-STOP réel.
- [x] **Poste de commande — contrôles humains et limites réglementaires :** le panneau `VIRTUAL` et la checklist laboratoire/EASA sont bilingues; ils affichent les points critiques de préparation sans constituer une approbation, une certification, une autorisation de vol ou la preuve d’un essai réel; aucune transition UI/backend ne promet un déverrouillage post-HIL dans ce runtime.
- [x] **Isolation propriétaire/projet :** géofences mises en cache par clé composite `(project_id, owner_id)`; une lecture de base de données sans propriétaire authentifié échoue fermement; les routes HTTP fournissent l’utilisateur et le projet possédés; préflight refuse les auto-checks sans contexte propriétaire/projet; snapshot, calcul, cache, déduplication d’alertes et historique télémétrique restent scoppés au propriétaire et au projet explicites; aucun fallback vers une géofence ou un drone d’un autre projet/tenant n’est accepté.
- [x] **Archive source finale :** fournir les sources complètes sans secrets, environnement virtuel, dépendances installées, bases SQLite, sauvegardes temporaires ni build généré; inclure le rapport d’audit et le patch de réversibilité.
- [x] **Preview temporaire sécurisée :** vérifier l’index, les vues AeroMind directes, `/manus-routes.json`, `/api/health`, `/api/ready` et `/api/hardware/status` `virtualOnly=true` sur le relais HTTPS du sandbox; garder `HARDWARE_CONTROL=false` et aucun SITL.
- [x] **Preview WebDev stable :** Preview WebDev gérée active sur le port 3000 avec `AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false`, SITL désactivé; `/api/health` est `ok`, `/api/hardware/status` confirme `virtualOnly=true`, aucune commande physique émise, et les en-têtes restent compatibles avec l’iframe Preview. Aucune publication production ni connexion matérielle réalisée.

## Directive Aeromind — chaîne institutionnelle GATE 01 à GATE 05 (1 novembre 2026)

- [x] **Chaîne institutionnelle explicite :** demande virtuelle, utilisateur habilité, responsables distincts GATE 01–04 et Super-Administrateur GATE 05 représentés par le service persistant ; les validations sont séquentielles et les rôles erronés, les répétitions et les étapes prématurées sont refusés.
- [x] **Code de transmission :** après GATE 04, AeroMind génère un code HMAC lié à la demande; le Super-Administrateur vérifie origine, intégrité et historique avant décision. Le code seul n’autorise aucune action.
- [x] **Décision personnelle GATE 05 :** rôle `super_admin` exclusif, vérification de transmission obligatoire, auteur, horodatage, note et journal append-only; le rôle générique `approver` ne peut pas décider GATE 05.
- [x] **Simulation préservée et sortie physique séparée :** commandes virtuelles, adaptateur simulation-only et code MAVLink préservés. La simulation reste autorisée aux rôles habilités; le service institutionnel ne contient aucun transport, pilote, socket ou jeton matériel et le runtime final garde les sorties physiques désactivées.
- [x] **Traçabilité :** tables et événements append-only pour soumission, validations/refus, transmission, décision GATE 05 et exécution simulée, avec demande, auteur, rôle, horodatage et corrélation.
- [x] **Interface, tests et livraison :** panneau GATE dans le simulateur, 4 tests backend GATE, 49 tests matériels sur doubles, 365 tests frontend, typecheck, build, Preview port 3000 et rapport final. Archive source finale à produire sans dépendances, bases, secrets ni build généré.

## Demande — Centre Mécanique, filerie et intégration drone (2 novembre 2026)

- [x] **Onglet Centre Mécanique :** ajouter un centre natif distinct du Centre Paramétrique, du Digital Twin et de l’atelier de construction, accessible depuis la navigation principale et relié au même `ConceptConfig` projet.
- [x] **Structure et nomenclature :** représenter les pièces, sous-ensembles, matériaux, masses indicatives, interfaces et statuts de revue; distinguer les données de conception des données vérifiées constructeur.
- [x] **Installation des pièces :** permettre d’ajouter, positionner logiquement, sélectionner et faire progresser le statut documentaire des composants installés, sans déclencher de fabrication ni de commande matérielle.
- [x] **Filerie et câbles :** gérer les fils/câbles par origine, destination, bus, section, longueur indicative, chemin, points de maintien et contrôles de séparation; signaler les données incomplètes et les conflits de routage.
- [x] **Connecteurs :** gérer type, broches, côté A/B, verrouillage documentaire, compatibilité et état de vérification; ne jamais ouvrir une liaison physique réelle.
- [x] **Maintenance et revue :** gérer actions, intervalles, outils, accessibilité, pièces de rechange et statuts de revue; conserver les limites de pré-dimensionnement et l’absence de certification automatique.
- [x] **Synchronisation et limites :** persister le bloc Centre Mécanique avec le projet, réutiliser les briques Mechanical Twin/assemblage existantes, préserver la chaîne GATE et garder la sortie matérielle désactivée.
- [x] **Validation et livraison :** typecheck, build, tests ciblés, Preview fonctionnelle et archive source complète sans secrets, dépendances ni artefacts générés.

## Extension turbo — atelier d’assemblage mécanique (2 novembre 2026)

- [x] **Atelier manuel :** créer des pièces documentaires libres, des gabarits de fixation et des éléments de sous-ensemble moteur depuis le Centre Mécanique.
- [x] **Assemblage contraint :** représenter des relations de contact, concentricité, parallélisme et autres contraintes avec états à vérifier, satisfaits ou en conflit.
- [x] **Visserie :** intégrer boulons, vis, écrous, rondelles, entretoises et inserts avec taille, matériau, quantité, couple indicatif et état de montage.
- [x] **Graissage :** intégrer les points de lubrification avec cible, produit à préciser, quantité, intervalle, accès et état d’entretien.
- [x] **Limites industrielles :** conserver l’étiquetage indicatif; aucun solveur industriel, ordre de fabrication, couple certifié, achat, mise sous tension ou liaison physique n’est activé.
- [x] **Validation :** typecheck, build Vite et suite frontend réussis; l’extension reste dans le même snapshot `ConceptConfig` et dans le mode `VIRTUAL ONLY`.

## Refonte cible — AeroMind Mechanical Workbench (2 novembre 2026)

- [x] **Coque d’ingénierie :** remplacer la présentation tabulaire principale par une coque professionnelle en trois panneaux : arbre d’assemblage, viewport central et inspecteur contextuel.
- [x] **Viewport et modes :** connecter le viewport 3D Mechanical Twin au design actif, afficher l’assemblage ISO, la vue éclatée réglable et les modes Part Studio mécanique, Assembly, Filerie/Connectique et Maintenance.
- [x] **Arbre et sélection :** synchroniser la sélection arbre/viewport, distinguer les pièces du Twin et les pièces manuelles, afficher les révisions locales et la recherche.
- [x] **Barre d’outils :** fournir annuler/rétablir, enregistrer, créer une pièce, vue éclatée, mesure documentaire, variante et plein écran.
- [x] **Inspecteur :** fournir les panneaux identité, géométrie, assemblage, interfaces et maintenance pour la pièce sélectionnée.
- [x] **Limites et sécurité :** conserver VIRTUAL ONLY, la réversibilité locale, les métriques indicatives et l’interdiction de toute sortie matérielle ou certification implicite.
- [x] **Validation :** typecheck, build et suite frontend réussis; Preview et route directe du Centre Mécanique vérifiées.

## Recalibrage interfaces — longueurs et largeurs (2 novembre 2026)

- [x] **Desktop fluide :** largeurs gauche, centre et inspecteur basées sur `clamp()` avec priorité dimensionnelle au viewport 3D central.
- [x] **Hauteur adaptative :** hauteur globale et viewport calculés à partir de la hauteur disponible, avec ratio 16:9 et limites min/max pour éviter les débordements.
- [x] **Tablette :** passage contrôlé à deux colonnes, inspecteur réorganisé sous la zone principale et onglets défilables.
- [x] **Mobile :** empilement arbre → viewport → inspecteur, barre d’outils défilable et viewport en ratio 4:3 pour préserver la lisibilité.
- [x] **Validation :** typecheck et build Vite réussis; les règles dimensionnelles sont isolées dans `mechanical-workbench.css`.

## Modernisation commande — gouvernance physique indépendante (2 novembre 2026)

- [x] **Panneau de gouvernance :** ajouter dans Mission Operations une demande de contrôle matériel contextualisée par projet et drone actif.
- [x] **Chaîne hiérarchique :** représenter GATE 01 à GATE 04, l’ordre obligatoire, le code de transmission et la décision Super-Administrateur comme étapes distinctes.
- [x] **Journal et contrôle :** afficher les validations, auteur courant, horodatage local, expiration documentaire et révocation.
- [x] **Séparation de sécurité :** afficher explicitement que GATE 05 ne vaut pas autorisation matérielle; la sortie physique, MAVLink et WSS restent verrouillés dans la Preview.
- [x] **Commandes virtuelles :** conserver les commandes de scénario et leur exécution synthétique locale sans ouvrir d’actionneur.
- [x] **Validation :** typecheck et build Vite réussis; aucune connexion physique ni émission de commande réalisée.

## Sécurité LABBENCH 01 — comptes privilégiés

- [x] **Règle conservée :** le mot de passe et le TOTP restent obligatoires pour les comptes Admin et Super-Admin; aucune exemption privilégiée n’est introduite.
- [x] **Signalisation :** l’écran de connexion LABBENCH indique explicitement cette règle afin d’éviter une interprétation ambiguë de la chaîne de validation.
- [ ] **Alternative acceptable ultérieure :** étudier un fournisseur d’identité MFA/passkey institutionnel équivalent, sans réduire l’assurance d’authentification et sans supprimer le step-up des opérations sensibles.

## Cahier des charges — Aeromind Aerodynamic Simulation Center (3 novembre 2026)

- [ ] **Importateur de modèles 3D :** permettre l’importation des formats STEP, STL, OBJ, 3MF et formats CAD compatibles; afficher le modèle en trois dimensions; prévoir rotation, zoom, déplacement, sélection de surfaces, inspection géométrique, vérification des unités et détection des défauts géométriques. Ne marquer comme décodé/inspecté que ce qui est réellement pris en charge par un parseur vérifié; conserver les sources importées.
- [ ] **Préparation de simulation et maillage :** définir la vitesse et la direction du flux d’air, la température, la pression, la densité, la viscosité, les conditions atmosphériques, le modèle de turbulence, le type de calcul et les conditions aux limites; définir et sauvegarder des scénarios; préparer/générer un maillage uniquement lorsque le calcul livré le permet et montrer la méthode, l’état et les limites.
- [ ] **Solveur CFD réel — ouverture explicite :** le moteur doit utiliser un solveur CFD réellement intégré ou un service externe documenté. Un cas préparé/exporté, une animation, un modèle analytique ou une visualisation ne sont pas une simulation CFD exécutée. Pour ce lot, préparer le flux OpenFOAM et conserver l’état « solveur non connecté / calcul CFD indisponible » jusqu’à un raccordement réel; garder l’item ouvert tant qu’un solveur n’a pas été raccordé et qu’un calcul vérifiable n’a pas été exécuté.
- [ ] **Visualisation des écoulements :** représenter lorsque des données de calcul existent des lignes de courant, champs de vitesse, distribution de pression, zones de turbulence, vorticité, écoulements autour des surfaces, zones de séparation et résultats de convergence; prévoir les modes 3D Flow, Pressure Map, Velocity Map, Streamlines, Cross Sections et Comparative View. Les résultats non disponibles ne doivent pas être remplacés par une animation portant l’étiquette CFD.
- [ ] **Analyse de performance et propulsion :** analyser traînée, portance, rapport portance/traînée lorsque pertinent, distribution de pression, résistance aérodynamique, effets de géométrie, sensibilité aux conditions atmosphériques et interactions entre éléments; prévoir les interactions rotor/flux d’air, effets des structures, interférences, répartition des flux et effets de configuration. Toute estimation simplifiée doit être distinguée du CFD et chaque hypothèse de propulsion documentée.
- [ ] **Comparaison et optimisation :** comparer différentes géométries et versions, analyser les performances, visualiser les différences, évaluer les compromis, produire des recommandations, conserver l’historique des simulations et transmettre toute modification proposée au Centre PARAMETRIC pour validation et conservation des versions. Ne pas écrire/valider silencieusement une géométrie de projet.
- [ ] **Gestion des simulations :** chaque simulation doit posséder un identifiant, un modèle utilisé, une version, les paramètres, le solveur, le maillage, les conditions initiales, une date, un temps de calcul, des résultats, un niveau de convergence et les limites du modèle; prévoir le suivi des tâches de calcul et de leurs ressources. Un champ non renseigné ou indisponible doit rester absent/indisponible, jamais fictivement rempli.
- [x] **Rubriques de l’interface :** fournir Aerodynamic Dashboard, 3D Model Importer, CFD Workspace, Simulation Setup, Mesh Generator, Airflow Visualization, Pressure Analysis, Rotor Flow Analysis, Performance Comparison, Design Optimization, Simulation History, Technical Reports, Solver Management et Settings, intégrés à la navigation Aeromind et reliés aux autres centres sans remplacer le workspace existant.
- [ ] **Intégration Aeromind :** définir les échanges avec le Centre PARAMETRIC pour réception de géométries et transmission des optimisations; le Centre MECANIC pour les contraintes mécaniques; ELECTRONICS CENTER pour les équipements/configurations pertinents; VIRTUAL FACTORY pour les modèles validés pour fabrication; INTELLIGENCE CENTER pour l’analyse des résultats et tendances. Les destinations non raccordées doivent apparaître comme indisponibles/en attente, pas comme transmises.
- [x] **Vérité scientifique et rapports :** distinguer explicitement simulation réelle, modèle analytique simplifié, estimation théorique, résultat expérimental et résultat non validé. Les rapports présentent hypothèses, conditions de calcul, incertitudes et limites. Un cas OpenFOAM exporté et sans résultats demeure un cas préparé/non résolu.
- [x] **Livraison et validation :** vérifier typecheck, build, tests pertinents, routes, principales commandes et export; fournir un ZIP final nettoyé et une Preview fonctionnelle. Aucune mise en production n’est implicite.

## État de livraison — 3 novembre 2026

- [x] Parcours navigateur : accès direct `/?view=aero-cfd`, 14 rubriques ouvertes, scénario local enregistré, mode ISA/manuelle vérifié, estimation analytique tracée, import OBJ inspecté, taille de domaine estimée sans création fictive de maillage, historique CSV et rapports JSON/Markdown exportés, manifeste de préparation OpenFOAM exporté, proposition locale exportée et absence de solveur explicitement contrôlée.
- [x] Contrôles du code : `pnpm check` réussi (TypeScript et 2 617 clés de catalogues), `pnpm test` réussi (78 fichiers / 374 tests) et `pnpm build` réussi. L’API Preview répond sur le port 3000 en mode simulation; le projet ne sera pas publié en production par cette livraison.
- [ ] CFD réel : en attente du raccordement OpenFOAM ultérieur, conformément à l’accord utilisateur. STEP/CAO non décodés, génération de maillage volumique, champs CFD, convergence et suivi de ressources de solveur restent indisponibles.
- [ ] Lint de traduction complémentaire : `pnpm i18n:lint` signale des littéraux JSX non catalogués dans le dépôt existant, y compris certains libellés français de la nouvelle interface; `pnpm check` et le build standard restent réussis.


## Cahier des charges — Aeromind Intelligence Center (3 novembre 2026)
- [x] **Architecture multi-agents :** le Centre Intelligence expose un Master Intelligence Agent et les agents Parametric, Mecanic, Electronics, Aerodynamic, Manufacturing, Fleet et Quality, chacun avec rôle, couverture, statut et périmètre visibles.
- [x] **Master AI Workspace :** la vue `intelligence-center` fournit conversation, historique, agents, état des tâches, documents, résultats, recommandations et actions soumises à approbation.
- [x] **Orchestration :** une demande globale identifie les centres concernés, crée des sous-tâches, les distribue et consolide un rapport sans modifier silencieusement la conception active.
- [x] **Mémoire technique :** les documents affichent type, source, version et distinction vérifié/hypothèse/recommandation; un fichier importé entre en quarantaine documentaire et ne devient pas automatiquement validé.
- [x] **Aide à la décision :** comparaison d’options, compromis, niveau de confiance, risques et recommandation sont affichés avec approbation/refus humain explicite.
- [x] **Amélioration continue :** les signaux historiques produisent des propositions qui doivent être validées ou écartées avant toute modification de procédure.
- [x] **Gestion IA :** modèles principal, solution de repli, état de routage et rappel « aucune clé côté client » sont visibles et actionnables.
- [x] **Gouvernance :** cinq niveaux d’autorisation sont représentés; le niveau physique reste verrouillé et la validation humaine peut être activée/désactivée dans l’interface.
- [x] **Opérationnalité :** navigation par rubriques, envoi de demandes, lancement de mission, import de document, recherche, approbation, refus, commutateurs, historique et réinitialisation disposent d’actions fonctionnelles.
- [ ] **IA distante et persistance serveur :** raccordement d’un fournisseur LLM externe et stockage durable des missions restent dépendants d’un secret et d’un contrat serveur dédiés; le workspace livré fonctionne avec un moteur local déterministe et ne prétend pas fournir ces intégrations.

## Cahier des charges — modernisation corrective Aeromind (3 novembre 2026)

- [ ] **Examen et synchronisation globale :** « Tu fasses un examen rapide de tout Aeromind »; corriger les dysfonctionnements des « boutons, écrans, commandes, structures, données » restés « statiques et décoratifs »; les rendre « opérationnels, fonctionnels et synchronisables » afin que « toutes les interfaces doivent communiquer entre elles, échanger les données dans le cadre d'une véritable synchronisation complète et opérationnelle ». L’examen de cette session couvre les flux et anomalies explicitement contrôlés; la complétude de tous les modules demeure à auditer avant clôture.
- [ ] **Autorité et commandes physiques :** le cahier des charges demande des commandes physiques contrôlées par Aeromind et une arborescence décisionnelle partant de l’utilisateur jusqu’au Super-Admin. Cette demande n’active aucun transport physique dans la Preview ni l’archive de démonstration; tout chemin réel demeure conditionné à une architecture matérielle et à une validation indépendante de sûreté, habilitations, essais et autorisations. Les contrôles VIRTUAL portent uniquement sur un scénario logiciel.
- [x] **Libellés de statut :** éviter la formulation d’état que l’utilisateur demande de retirer, tout en conservant une indication claire, exacte et visible qu’un parcours est une simulation logicielle et qu’aucune action réelle n’est attestée.
- [ ] **Livraison :** fournir un fichier source final nommé « Aeromind » et une URL de prévisualisation; ne clore qu’après archive générée sans secrets, bases locales, dépendances installées ni build, et vérification de la Preview WebDev.


## Livraison Super Turbo 2026-11
- [x] Identités administratives et démo externalisées vers les variables d’environnement.
- [x] CSRF/mutations API renforcés, y compris l’en-tête CORS `X-CSRF-Token`.
- [x] Packaging Docker vérifié et configuration de production documentée.
- [x] Registre des licences open source ajouté.
- [x] Parcours de démonstration commerciale documenté.
- [ ] Renseigner les secrets de production dans le gestionnaire de secrets avant déploiement.
