# TODO — Modernisation AeroMind IA

## Pipeline de rendu technique partagé

- [x] Intégrer un pipeline commun utilisé par les centres production, conception, CAD, jumeau mécanique, simulation, maintenance, qualité et Super-Admin lorsque le modèle technique est disponible. Le pipeline reçoit au minimum l’identifiant du drone, le modèle mécanique, les paramètres actifs, le preset, la caméra, les couches visibles, le niveau d’explosion, la pièce sélectionnée et le contexte du centre.
- [x] Garantir que le rendu utilise le drone réellement sélectionné et le même modèle mécanique que les calculs/nomenclatures/vues de composants ; aucun modèle générique ne doit apparaître silencieusement. Si le modèle détaillé manque, afficher « Modèle technique détaillé indisponible ».
- [x] Exposer les presets Solide paramétrique, Blueprint, Wireframe, X-Ray/structure interne, Vue éclatée et Vue technique monochrome, avec conservation du preset lorsque le contexte le permet.
- [x] Exposer les vues isométrique, dessus, face, profil, caméra orbitale, zoom, recentrage et réinitialisation ; la vue isométrique est la vue par défaut du preset Blueprint.

## Inspection, cohérence et performance

- [x] Permettre l’affichage, le masquage et l’isolation des familles châssis, bras, moteurs, hélices/rotors, alimentation, contrôleur, électronique, capteurs/caméras, charge utile, antennes et fixations.
- [x] Au clic sur une pièce, afficher nom, catégorie, dimensions principales, identifiant de modèle, état de validation et provenance ; la sélection seule ne modifie aucune donnée.
- [x] Refléter l’envergure, longueur, hauteur, diamètre d’hélice, nombre de moteurs, positions, châssis, capteurs, charge utile et configuration de propulsion ; une modification paramétrique met à jour la géométrie active sans revenir à un modèle générique.
- [x] Activer axes X/Y/Z, grille, échelle, dimensions principales, centre de gravité et points d’ancrage lorsqu’ils existent ; distinguer conception, simulation et référence, sans présenter les cotes comme certification réglementaire.
- [x] Éviter les recalculs complets inutiles, réutiliser mesh/matériaux, charger progressivement les détails, signaler le chargement et afficher un état « rendu limité » en cas de contrainte de performance.

## Compatibilité et erreurs

- [x] Fonctionner dans la Preview Webdev, sur écrans bureau/intermédiaires et avec une dégradation contrôlée sans WebGL/WebGL2 ; le fallback doit être identifié et ne pas prétendre être le rendu 3D complet.
- [x] Traiter explicitement drone non sélectionné, modèle indisponible, géométrie partielle, composants internes absents, WebGL indisponible, erreur de chargement, données paramétriques incomplètes, désynchronisation de version et rendu limité.

## Intégration et sécurité

- [x] Préserver la navigation des centres et le cockpit existant, sans régression de simulation, LabBench, gouvernance, navigation ou jumeau mécanique.
- [x] Conserver `HARDWARE_CONTROL=false`, `AEROMIND_VIRTUAL_ONLY=true` et `physicalOutputEnabled=false` dans Preview et simulation ; aucun preset, clic, export ou modification visuelle ne doit activer un moteur, envoyer une commande, piloter un équipement ou modifier une configuration matérielle réelle.
- [x] Respecter les droits adaptés à chaque centre et conserver step-up, CSRF, audit, interverrouillages et validations séquentielles G01–G05. La portée cumulative est L1:G01, L2:G01–G02, L3:G01–G03, ADMIN/L4:G01–G04, SUPER-ADMIN/L5:G01–G05.
- [x] Journaliser selon les règles existantes l’ouverture d’un modèle, le changement de preset, la sélection et la visibilité des composants, la vue éclatée, les paramètres, comparaisons et exports ; marquer clairement les interactions locales non persistantes.

## Validation et livraison

- [x] Intégrer un Centre de protection AeroMind séparé de l’arborescence métier, avec sondes anti-bug, intégrité applicative, anti-piratage applicatif, détection de disponibilité/brouillage, alertes et export JSON ; conserver la séparation humaine et G01–G05.
- [~] Vérifier le build frontend, les tests ciblés, les checks Python, `/api/ready`, `/manus-routes.json` et la Preview sur le port 3000. Frontend : typecheck + 424/424 tests + build OK ; backend : 347 tests OK, 14 ignorés, 1 test admin dépendant d’un compte primaire non seedé dans l’état de test courant.
- [x] Enregistrer un checkpoint propre du projet Webdev avec les fichiers réellement livrés.
- [x] Générer et fournir `Aeromind.IA-modernise.zip` sans `node_modules`, caches, vrais `.env` ou artefacts inutiles.
- [x] Fournir une documentation courte des presets, des états dégradés, de la provenance du modèle et de la séparation simulation-only.

## Preuves de livraison

- Checkpoint Webdev : `150b54954e8725f9dcdb3cdc9b18b5ff12033182` sur `main`.
- Preview vérifiée sur le runtime 3000 : `/api/ready` retourne `{"ready":true,"database":"connected","mode":"simulation"}` et `/manus-routes.json` retourne 39 routes déclarées.
- Archive source : `/home/ubuntu/Aeromind.IA-modernise-final.zip`, 869 entrées, SHA-256 `f92446d0fc50f28df7bbb92709589225b198b53dfd312359f8eaa3fc91c95900`.

## Modernisation demandée — rendus des centres de conception

- [x] Préserver l’architecture organisationnelle indépendante d’Aeromind ainsi que ses contrôles et interactions existants, sans substituer une organisation Manus ni ajouter de nouveaux contrôles métier.
- [~] Faire afficher le drone réellement sélectionné et sa géométrie disponible, avec indication explicite lorsque le modèle détaillé ne peut pas être récupéré. Les huit OBJ sont chargés dans IDDS ; les autres centres utilisent encore un modèle paramétrique.
- [~] Corriger les modes de rendu pour que leur mécanisme visuel agisse effectivement sur le modèle actif, y compris les modes de projection, filaire, transparence, vue éclatée et styles applicables. Les modes de base sont raccordés ; les limitations des modes avancés et du repli SVG sont précisées dans le rapport.
- [~] Vérifier la cohérence des sélections, paramètres, interactions et rendus, puis fournir une prévisualisation fonctionnelle et une archive source propre et complète. Les tests automatisés ne remplacent pas une recette visuelle complète de tous les centres et modèles.
