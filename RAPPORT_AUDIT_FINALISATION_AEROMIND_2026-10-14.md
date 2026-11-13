# AeroMind AI — audit de finalisation progressive

**Date :** 14 octobre 2026  
**Dossier audité :** `/home/ubuntu/aeromind`  
**Périmètre :** source React/Vite/TypeScript, API FastAPI/SQLAlchemy, modèles, documents, tests, prévisualisation locale/publique et garde-fous matériels.  
**Type d’intervention :** audit et état de référence; aucune modification de code applicatif ni migration de base de données dans cette phase.

## 1. Résumé exécutif

AeroMind est une application existante de conception de drones, d’assemblage virtuel, de simulation/documentation et de gestion de projets. Elle dispose d’un frontend conséquent, d’une API FastAPI, de modèles SQLAlchemy, de bibliothèques de drones et composants, d’un workflow de prototype versionné et d’un centre de validation humaine limité à la simulation.

Les contrôles exécutés dans l’environnement courant sont au vert pour les tests unitaires et la compilation. L’API locale répond et la base est signalée connectée. **L’authentification OIDC n’est toutefois pas configurée dans cette prévisualisation**; les parcours de projet authentifiés, l’identité fournisseur réelle et la persistance après reconnexion n’ont donc pas été démontrés. Le build frontend passe, avec un avertissement de performance lié aux gros bundles.

Les interfaces et les données de conception restent majoritairement des outils de **conception virtuelle préliminaire**. Le rendu 3D n’est pas une CAO mécanique complète; les analyses CFD, éléments finis, interférences physiques, thermique et CEM ne sont pas démontrées comme exécutées par des solveurs intégrés. Les informations calculées doivent rester identifiées comme estimations ou résultats synthétiques.

Le verrouillage matériel est conservé : les tests confirment que les commandes physiques et transitions matériel restent refusées. Aucun pilote matériel réel n’a été détecté ou testé.

## 2. Portée et limites des éléments reçus

Le fichier `pasted_content_2.txt` comporte **261 lignes / 13 228 octets** et s’arrête sur le fragment « Prévoir des messages d’erreur utiles, des états de chargement, la validation des formulaires et une interface ». Le cahier est donc incomplet : les exigences et phases éventuelles qui suivent ne sont pas incluses dans l’analyse. Il mentionne une image de référence, mais aucune image n’est jointe à ce message.

Les précédents documents d’audit du dossier sont utiles comme historique, mais certains reflètent une copie antérieure située sous `/home/ubuntu/work_aeromind` et des états plus anciens (par exemple, ils signalent l’absence de `requirements.txt`, `Dockerfile`, `sitl_modules` ou du backend, alors que ces éléments sont présents dans `/home/ubuntu/aeromind`). Le présent rapport constitue l’état de référence pour le dossier courant; les anciens rapports ne sont pas supprimés ni réécrits.

## 3. Point de restauration et état conservé

Avant toute intervention sur le code, une copie d’archive du snapshot précédent a été créée et son intégrité ZIP vérifiée :

`/home/ubuntu/aeromind-pre-cahier-finalisation-2026-10-14.zip`

Ce point de restauration couvre le code livré dans l’archive précédente; il ne constitue pas une sauvegarde d’une base de données de production ou de secrets de déploiement. Aucun fichier applicatif, schéma de base ou paramètre de sécurité n’a été modifié pendant la présente phase d’audit.

## 4. Architecture observée

| Couche | Technologie et modules constatés |
|---|---|
| Interface | React 19, TypeScript, Vite; navigation et vues principales regroupées en partie dans `frontend/client/src/pages/Home.tsx`. |
| Conception | `DesignStudioView.tsx`, `DroneSketchProWorkbench.tsx`, schéma de rendu aéronautique versionné et visualisations SVG/Three.js/React Three Fiber selon les vues. |
| Assemblage | `VirtualAssemblyWorkshop.tsx`, catalogue de pièces, matériaux installés, masse déclarée, vues visuelles assemblée/éclatée/relations. |
| État partagé | `ConceptConfig`, snapshot workspace Zod versionné, `localStorage` et `BroadcastChannel`; sélection drone/matériau et croquis personnalisé partagés entre vues. |
| Backend | FastAPI, Pydantic, SQLAlchemy; modules `business_api.py`, `workflow.py`, `engineering_document.py`, `command_center.py`, `hardware_api.py`, authentification/OIDC et état opérationnel. |
| Données | Modèles `User`, `Project`, `Drone`, `Simulation`, `Report`, `LabSession`, `UserSetting`, `HardwareLog`, `PrototypeVersion`, `WorkflowRun`, `EngineeringDocumentRecord`, `CommandRequestRecord`, `CommandAuditEvent`. SQLite est prévu pour le développement; PostgreSQL est prévu pour le déploiement. |
| Simulation | Moteur local et scénarios d’essai documentaires/synthétiques. Aucun solveur CFD/FEA ou modèle physique certifié n’a été constaté dans les validations courantes. |
| Lancement | `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `render.yaml`, scripts frontend présents. Docker/Render n’ont pas été construits ou déployés pendant cet audit. |

Inventaire ciblé : **28 déclarations de routes** repérées dans les modules d’API FastAPI; **38 fichiers de composants/pages TypeScript** au niveau audité; **30 fichiers de tests** au total (28 suites Vitest et 2 fichiers Python).

## 5. État de référence exécuté

| Contrôle | Résultat observé | Portée |
|---|---:|---|
| `python3 -m unittest discover -s tests -v` | **10 tests réussis** | Centre de commande de simulation et workflow existant; notamment refus des commandes physiques, authentification requise et flux de démonstration. |
| `pnpm run check` | **Réussi** | Vérification TypeScript stricte. |
| `pnpm test -- --run` | **28 fichiers / 139 tests réussis** | Tests unitaires frontend, dont schéma, contrôle, simulation et workspace. |
| `pnpm run build` | **Réussi** | Bundle Vite généré; avertissement : chunk principal d’environ 2,09 Mo minifié et plusieurs chunks au-delà de 500 Ko. |
| `GET /api/health` local | **HTTP 200**, `status: ok`, base `connected`, OIDC `not_configured` | Santé de l’instance locale courante, pas preuve d’authentification fournisseur réelle. |
| `/` local et public | **HTTP 200** | La prévisualisation sert l’interface. Aucun déploiement de production n’est attesté. |
| Sélection drone/matériau dans l’interface | **Propagation visible dans le bandeau partagé** | Contrôle manuel antérieur dans la prévisualisation; la sélection et l’ajout à la nomenclature restent deux actions distinctes. Ce contrôle n’est pas une recette E2E exhaustive. |
| Démarrage Docker, migration réelle, OIDC fournisseur, tests multi-identités | **Non vérifiés** | Hors contrôles exécutés dans cette phase. |
| Commandes sur matériel réel | **Non exécutées et bloquées** | Aucun matériel ni adaptateur réel n’est configuré/démontré. |

## 6. Matrice de statut fonctionnel

Les statuts décrivent les preuves disponibles dans le dossier et cet environnement; ils ne valent pas qualification industrielle.

| Fonction | Statut | Constat et limite |
|---|---|---|
| Cockpit et navigation | **Partielle** | Les vues existent et compilent; tous les parcours fonctionnels ne sont pas couverts par navigateur automatisé. |
| Création et CRUD de projets | **Partielle** | Routes et modèles présents; la création exige une session et le fournisseur OIDC n’est pas configuré ici. Le parcours authentifié de bout en bout n’est pas vérifié. |
| Synchronisation entre vues | **Partielle** | Une configuration partagée et un store local/inter-onglets sont présents; les tests d’interface confirment le résumé global. Le conflit simultané multi-utilisateurs et la persistance serveur après reconnexion ne sont pas validés ici. |
| Catalogue de drones | **Partielle** | Profils et concepts sélectionnables; les catégories de drones et robots du cahier ne disposent pas toutes de règles métier dédiées. |
| Catalogue de matériaux et BOM | **Partielle** | Catalogue, sélection, nomenclature, masse déclarée et provenance existent; la qualité des données fournisseur varie et les articles conceptuels ne sont pas des données certifiées. |
| Studio et dessin personnalisé | **Partielle** | Croquis SVG, calques, outils et composants paramétriques; ce n’est pas un noyau CAO avec contraintes géométriques industrielles. |
| Affichage 3D | **Partielle** | Three.js/React Three Fiber et contrôles de caméra existent pour une visualisation; aucun modèle CAO vérifié ni calcul de collision systématique n’a été démontré. |
| Simulation | **Partielle** | Calculs/trajectoires locaux et workflow de démonstration testés; les résultats sont synthétiques/préliminaires, sans solveur CFD, FEA, thermique ou CEM attesté. |
| Préparation fabrication/assemblage | **Partielle** | BOM et atelier virtuel disponibles; gamme de fabrication qualifiée, suivi de lot, outils réels, non-conformités et signatures opératoires complets non démontrés. |
| Essais et validation | **Partielle** | LabBench, hall d’essais et workflow existent; la télémétrie synthétique n’est pas un essai réel et aucune approbation de navigabilité ne peut en découler. |
| Rapports et exports | **Partielle** | Modèles et exports de données existent; seuls les formats effectivement générés doivent être annoncés. STEP/STL/DXF/DWG valides ne sont pas démontrés par les contrôles exécutés. |
| Conformité réglementaire | **Absente / à établir** | Aucune matrice complète reliée à des références normatives vérifiées, méthodes, preuves, résultats et responsables n’a été démontrée. Aucune certification ne doit être inférée. |
| Authentification/autorisation | **Partielle** | Code OIDC et isolation métier présents; OIDC est `not_configured` dans l’instance courante, donc intégration fournisseur et tests de rôles non vérifiés. |
| Sécurité des commandes physiques | **Opérationnelle comme barrière de refus** | Les tests confirment le verrouillage des transitions matérielles. Cela n’est pas une fonctionnalité de pilotage réel. |
| CI et déploiement | **Non vérifiable dans cet audit** | Fichiers de déploiement présents, mais Docker et cible de production non testés. |

## 7. Problèmes et risques prioritaires

### P0 — avant une déclaration de plateforme d’ingénierie industrielle

1. **Persistance complète non démontrée** : vérifier sauvegarde/chargement de la conception, BOM, dessin, exigences et versions avec un projet authentifié, y compris rechargement du navigateur.
2. **Contrat de conception dispersé** : `ConceptConfig`, profil catalogue, pièces de Studio et documents/workflows coexistent; le graphe de composants, connexions, sous-ensembles et validations n’est pas un PLM normalisé.
3. **Risque de surinterprétation technique** : les vues, estimations et résultats synthétiques ne doivent pas être présentés comme CAO, simulation physique, certification ou mesure.
4. **OIDC non configuré dans cette instance** : aucun parcours projet authentifié ne peut être certifié depuis la prévisualisation courante.

### P1 — cohérence et traçabilité

1. Définir une version canonique et validée du document de conception, partagée entre frontend et API, avec identifiants stables et provenance des champs.
2. Concevoir une migration rétrocompatible avant toute évolution SQL; conserver snapshots et chemins de lecture précédents jusqu’à preuve de migration.
3. Ajouter un moteur de compatibilité explicite à quatre états (compatible, incompatible, avertissement, données insuffisantes), avec règles et entrées auditées.
4. Structurer les lignes de BOM par provenance (fabricant, utilisateur, concept, manquante), quantité, lot, état de vérification et référence documentaire.
5. Compléter le cycle documentaire/essais avec critères d’acceptation, preuves, responsables, statuts et historique, sans présenter l’achèvement d’un formulaire comme preuve de conformité.
6. Ajouter une recette navigateur authentifiée de création → sélection → conception → sauvegarde → rechargement → simulation → rapport, plus test multi-onglets et corruption/reprise du workspace.

### P2 — industrialisation

1. Découper progressivement le grand `Home.tsx`, avec tests de non-régression et sans remplacer la navigation existante.
2. Réduire le chargement initial par découpage du bundle et import différé; mesurer avant/après.
3. Vérifier Docker/Compose et CI dans un environnement reproductible, puis tester les migrations sur une base éphémère.
4. Ajouter tests responsive et d’accessibilité sur les vues principales.
5. Étudier l’intégration ultérieure d’un noyau CAO ou solveur externe; établir des formats d’échange uniquement après génération et validation de fichiers réels.

## 8. Ordre de finalisation proposé

1. **Phase A — Audit (terminée ici)** : inventaire, tests de référence, limites et sauvegarde de restauration.
2. **Phase B — Persistance et contrat canonique** : démontrer le flux authentifié existant; choisir le contrat document/version; ajouter schémas/tests; ne migrer la base qu’après revue de compatibilité et procédure de retour arrière.
3. **Phase C — Composants, connexions et compatibilité** : identifiants stables, règles traçables, états d’incertitude, BOM et sources documentaires.
4. **Phase D — Fabrication et essais** : lots, tâches, preuves et non-conformités en registres déclaratifs audités.
5. **Phase E — Simulation et CAO** : distinguer visuellement calcul analytique, moteur réellement exécuté, résultat importé et mesure expérimentale; intégrer des moteurs seulement après vérification.
6. **Phase F — conformité et déploiement** : vérification des références applicables à partir de sources primaires, recette indépendante, CI/migrations et validation de production.

Les catégories « robots mobiles » et « automatisation » doivent être traitées comme une extension de domaine distincte avec leurs exigences et unités propres; elles ne doivent pas être assimilées aux drones par défaut.

## 9. Décisions de prudence et retour arrière

- Préserver les écrans, modèles, routes et données actuels; aucun remplacement global n’est proposé.
- Ne pas activer de pilote ni de sortie matérielle : maintenir `HARDWARE_CONTROL=false` et les refus serveur.
- Ne pas ajouter de migration SQL irréversible avant validation du contrat de conception, des anciennes données, du chemin de migration et du rollback.
- Ne pas annoncer de certification, d’interférence calculée, de résultat CFD/FEA ou de format CAO si l’outil n’a pas réellement produit une preuve valide.
- Utiliser le snapshot d’avant-changement comme point de restauration du code; sauvegarder séparément toute base réelle avant une migration future.

## 10. Conclusion de phase

L’état de référence est établi et les contrôles locaux passent. Les différences entre les audits historiques et la copie courante sont documentées; le présent rapport fait foi pour `/home/ubuntu/aeromind` à la date indiquée. **Aucune modification de code applicatif n’a été faite pendant cette phase**, conformément à la séquence du cahier reçu qui demande de terminer l’audit, préserver l’existant et présenter le plan avant toute intervention structurelle.

Le cahier joint étant tronqué et l’image de référence absente, les critères au-delà du fragment reçu restent à intégrer lorsqu’ils seront disponibles.


## Addendum — Correction Observation Core (14 octobre 2026)

### Cause constatée

La vue est un panneau d’observation en lecture seule, pas une interface de télémétrie autonome. Sans passerelle WSS qui envoie des trames reconnues, aucune mesure GPS ou capteur n’est disponible; la carte utilise un repère local de scénario. L’API courante répond `status: ok`, base connectée, mais `oidc: not_configured`; cela n’établit pas de liaison à un aéronef.

Le code affichait néanmoins `98 %`, `41,8 °C` et `0,04 g` dès qu’un socket WebSocket s’ouvrait, même si ces champs n’étaient pas reçus. Le libellé « VITESSE AIR » pouvait aussi confondre vitesse de scénario et vitesse mesurée. Enfin, les onglets Systèmes/Spectre ne changeaient que le titre, sans changer le contenu du panneau. Ces comportements expliquent en partie l’impression que l’interface « ne fonctionne pas » ou prétend montrer des mesures absentes.

### Correction appliquée

- Les cartes affichent désormais une valeur uniquement si elle vient d’une trame WSS récente ou d’une estimation de scénario identifiée; sinon elles affichent `—` et la raison (« aucune donnée », « en attente », « périmée », « non fournie »).
- Ajout d’un parsing borné et optionnel pour qualité de liaison, latence, température et vibration. L’ouverture du WebSocket seule ne crée plus ces valeurs.
- Une trame vieille de plus de 5 secondes est considérée périmée par l’Observation Core; la déconnexion réinitialise aussi la source.
- « VITESSE AIR » est devenu « VITESSE »; les libellés de la batterie et du modèle local sont explicites; les statuts « NOMINAL » sans preuve ont été retirés.
- L’onglet Systèmes présente l’état de la passerelle, le mode, le GPS et l’horodatage effectivement reçus. L’onglet Spectre indique son indisponibilité lorsqu’aucune donnée spectrale n’est transmise, sans inventer de graphique.
- La sortie matérielle reste verrouillée; aucune commande physique n’a été ajoutée.

### Vérification du correctif

| Contrôle | Résultat |
|---|---:|
| TypeScript | Réussi |
| Vitest frontend | 28 fichiers / 139 tests réussis |
| Tests backend | 10 réussis |
| Build de production | Réussi; l’avertissement existant de bundle volumineux demeure |
| Test navigateur de Systèmes | Vue de passerelle réellement affichée; état « aucune liaison », aucune trame/GPS inventés |
| Test navigateur de Spectre | Message « Spectre indisponible » et absence de données spectrales simulées |
| Métriques sans flux | `—`, « aucune donnée reçue », « non fournie »; aucune valeur 98/41,8/0,04 affichée |


## Mise à jour — Studio de conception et de construction

À la suite de l’audit, le Studio a été enrichi sans remplacer les ateliers préexistants. Le nouveau tableau d’ingénierie regroupe le choix d’architecture, les principaux paramètres, l’aperçu conceptuel, les estimations, la navigation vers les modules et les exports réellement disponibles. Les profils multirotor, voilure fixe et VTOL sont sélectionnables depuis le catalogue; l’état du projet et ses paramètres sont envoyés au `setConfig` partagé. La vue centrale suit les dimensions éditées et indique explicitement quand seul un croquis personnalisé est disponible.

Les onglets amènent aux zones CAO/dessin, matériaux, avionique, assemblage, analyse et rapports. Le filtre français « avionique » a été raccordé à la catégorie de catalogue correspondante; la recette navigateur a trouvé **7 composants**. La simulation locale exécute le moteur `runSimulation`, expose masse/autonomie/rayon/charge alaire indicatifs et marque les résultats périmés lorsqu’un paramètre change. Les exports actifs sont le modèle OpenSCAD, la BOM CSV, le dossier d’ingénierie JSON et le document Studio JSON.

**Recette après modification :** TypeScript réussi; **28 fichiers de tests / 139 tests frontend réussis**; build de production réussi (l’avertissement préexistant relatif aux bundles volumineux demeure). Le contrôle navigateur a sélectionné un profil catalogue, lancé une analyse, observé la mise à jour d’un paramètre et l’état « configuration modifiée — relancer », puis vérifié les ancres Assemblage et Rapports.

**Limites inchangées :** mode simulation et brouillon local; persistance entre sessions conditionnée à un projet et à une session authentifiée. Ce Studio n’est pas un noyau CAO mécanique qualifié, n’exécute pas CFD/FEA, ne valide pas un vol et ne génère ni STEP ni dossier de conformité EASA/OTAN. Le verrou matériel demeure inchangé.
