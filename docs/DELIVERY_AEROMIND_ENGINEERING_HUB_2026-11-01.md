# AeroMind — Livraison intermédiaire du Aerospace Engineering Hub

**Date :** 1 novembre 2026  
**État :** socle d’intégration livré — **cahier des charges global non terminé**

## Synthèse

Le projet reçoit une entrée **AEROMIND HUB** dans le cockpit, une route directe `/engineering-hub`, un écran de synthèse en français et en anglais, les liens vers les parcours AeroMind déjà présents et un registre documentaire honnête des logiciels externes envisagés. Le Hub ne crée ni projet ni cellule automatiquement. Il expose le projet, la cellule et l’état de persistance actuellement reçus par le cockpit ; lorsque ces données manquent, il l’indique.

Cette livraison est un **socle de navigation et d’état**, pas la réalisation des douze départements comme douze produits techniques complets. Les cartes réutilisent des vues existantes. Leur badge « parcours » ou « couverture partielle » ne certifie ni leur maturité, ni un calcul, ni une validation d’ingénierie. Aucun adaptateur externe, gestionnaire d’identifiants, ordonnanceur persistant de calcul ou nouveau service backend n’a été implémenté dans ce lot.

## Éléments livrés

- Entrée de navigation `AEROMIND HUB` et route directe `/engineering-hub`, intégrées dans `frontend/client/src/pages/Home.tsx` et `frontend/client/src/App.tsx`.
- Hub React et styles dédiés dans `frontend/client/src/modules/engineering-hub/`.
- Trois vues : 12 domaines, 8 outils AeroMind existants, et 13 familles de connecteurs/formats.
- Libellés du Hub raccordés au traducteur central français/anglais (`frontend/client/src/lib/fr.json` et `en.json`).
- Lien vers les modules actuels avec état réel de contexte. La persistance n’est qualifiée de confirmée que si l’utilisateur est authentifié et que le projet actif a été retrouvé dans la requête serveur terminée.
- Dans le Centre paramétrique, ajout d’un avertissement visible lorsque le drone sélectionné est absent : la géométrie, les masses et dimensions de l’aperçu local sont des valeurs de démonstration non liées à un drone utilisateur et non persistées.
- Travaux antérieurs conservés dans l’archive : filigrane/logo global et réglages de filigrane dans la console Super Admin.

## Couverture affichée et limites vérifiées

| Domaine | Accès exposé | Limite explicitement conservée |
|---|---|---|
| Conception paramétrique & CAO | Centre paramétrique | Parcours existant ; aperçu local non enregistré sans cellule ; pas de validation de conception. |
| Structures & matériaux | Construction/équipements et bibliothèque existante | Aucun solveur FEM externe connecté par ce Hub. |
| Aérodynamique & CFD | Centre aéronautique | Résultats conceptuels non équivalents à un calcul CFD validé. |
| Électronique & PCB | Référentiel de composants | Pas d’éditeur schématique/PCB externe opérationnel déclaré. |
| Énergie & batteries | Parcours d’estimation existant | Estimations calculées, non mesures physiques. |
| Systèmes embarqués & logiciel | Commandes sûres/gouvernance | Pas de liaison ROS 2, PX4 ou Gazebo déclarée active. |
| Jumeau numérique & simulation | Digital Twin Explorer et simulation AeroMind | Sortie matérielle désactivée ; résultats non certifiés. |
| Essais & validation | Essais et scénarios | Essais physiques soumis à leurs procédures/autorisations séparées. |
| Fabrication & industrialisation | Nomenclature et préparation de fabrication | Aucun connecteur slicer déclaré actif. |
| Projets & configuration | Vue projets et services existants | La source projet existante reste la référence ; aucun second registre ajouté. |
| Maintenance & fiabilité | Opérations/gouvernance | Le service backend existe ; le parcours dédié reste à consolider. |
| Conformité & documentation | Exigences, rapports et revue | Aucune certification revendiquée sans preuves vérifiables. |

Le registre recense FreeCAD, OpenVSP, Siemens NX, SolidWorks, Blender, ANSYS, Abaqus/CalculiX, OpenFOAM/SU2/XFLR5, KiCad/LTspice/Altium, ROS 2/PX4/Gazebo, MATLAB/Simulink/Isaac Sim, PrusaSlicer/Cura/Fusion et GitLab/Teamcenter/Aras. Il affiche les prérequis ou indique « non testé ici » ; **il ne teste pas les binaires, licences, endpoints, credentials, échanges ni versions et ne prétend pas les connecter**.

## Recette navigateur

L’application a été ouverte à la route directe `/engineering-hub`. La recette DOM a confirmé **12 cartes de départements, 8 cartes outils et 13 lignes de connecteurs**. Les statuts du registre ne comportaient aucune connexion déclarée active. Le lien du premier département a ouvert le Centre paramétrique existant ; l’avertissement de prévisualisation non enregistrée y est apparu en l’absence de cellule. Le sélecteur d’interface a été testé en anglais puis en français et remis au français.

Captures réalisées durant cette recette :

- [Vue des départements](evidence/engineering-hub-departments.webp)
- [Vue des outils propriétaires](evidence/engineering-hub-tools.webp)
- [Vue Connecteurs & formats](evidence/engineering-hub-connectors.webp)

Les captures sont des preuves navigateur de cette session, en état de workspace vide ; elles ne représentent pas un projet ou une cellule utilisateur.

## Vérifications automatisées

- `pnpm check` : réussi ; catalogues contrôlés (2 617 clés synchronisées) et TypeScript sans erreur.
- `pnpm test` : **70 fichiers et 336 tests réussis**.
- `pnpm build` : réussi. Vite signale encore des bundles minifiés supérieurs à 1 536 kB ; la compilation n’échoue pas.
- Les tests Python backend n’ont pas été exécutés : l’environnement ne contient pas `pytest`, SQLAlchemy ni `httpx`. Aucun fichier backend ni migration de base de données n’a été modifié dans ce lot.

## Travaux requis avant de considérer le cahier des charges global achevé

1. Confirmer les modules existants département par département avec les critères d’acceptation du cahier maître, puis réaliser les interfaces/fonctions réellement manquantes au lieu de compter un lien comme une fonction terminée.
2. Concevoir un registre de connecteurs authentifié et persistant (états, versions, licences, endpoints, dernier contrôle, résultat/erreur), sans exposer de secrets, puis implémenter et tester les adaptateurs autorisés en environnement isolé.
3. Définir un modèle backend de tâches d’ingénierie et une file/worker persistants avant d’afficher des calculs externes comme disponibles ; ajouter migrations, RBAC, audit et tests API.
4. Exécuter les tests backend et E2E après installation des dépendances de développement conformes au dépôt.
5. Réaliser la revue sécurité et la validation par domaine, y compris les interdictions de sortie matérielle et les critères de preuve/certification applicables.

## Prévisualisation

URL de session : <https://3000-iymx51dvmzo58bgxmsc3g-7fb2d9b5.us5.manus.computer/engineering-hub>. L’hôte est temporaire et dépend du serveur de prévisualisation de cette session.
