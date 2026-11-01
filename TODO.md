

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
