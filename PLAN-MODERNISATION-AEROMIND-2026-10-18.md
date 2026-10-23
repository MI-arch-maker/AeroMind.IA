# AeroMinD.IA — Cadrage de modernisation de l’architecture

**Date :** 18 octobre 2026  
**Nature :** proposition d’architecture et feuille de route — ce document ne constitue ni une modification fonctionnelle du logiciel, ni une validation aéronautique, ni une certification.

## Avis général

Les axes proposés sont cohérents et peuvent donner à AeroMinD une valeur forte comme environnement d’avant-projet, d’inspection documentaire et de simulation. Il serait toutefois risqué de les ajouter comme une série de panneaux visuels indépendants : les résultats de solidité, de manœuvrabilité, de vent, de thermique, de matériaux et de simulation doivent partager les mêmes données de conception, les mêmes unités, la même provenance et le même état de confiance.

La recommandation est donc de moderniser d’abord le **socle de données et de preuves**, puis de relier à ce socle les analyses mécaniques, le Twin, les simulations et le cockpit. Toute donnée manquante doit rester « inconnue / à examiner » : une interface ne doit jamais transformer une absence de preuve en feu vert.

## Ce que le code actuel permet déjà d’affirmer

- `frontend/client/src/lib/engineeringReview.ts` réalise des contrôles rapides de cohérence sur l’architecture, les cotes, la masse, la batterie, la mission et les modules. Il laisse explicitement en revue le centre de gravité, les cas de charge structurels, les courbes moteur/hélice, la météo réelle, la fabrication et les essais matériels.
- `frontend/client/src/lib/virtualTestBench.ts` possède des scénarios locaux, dont un scénario de vent renforcé. Celui-ci ajoute une rafale synthétique fixe de 12 km/h, avec plafonnement à 60 km/h. Le contrôle précise qu’il s’agit d’un scénario de projet, pas d’une validation de stabilité en vol réel.
- `frontend/client/src/lib/materialLibrary.ts` agrège notamment un catalogue de composants fabricants et des pièces conceptuelles. Il faut séparer clairement **matière première**, **composant**, **référence fabricant** et **lot effectivement installé** avant d’utiliser ces entrées dans des calculs de résistance.
- `frontend/client/src/lib/aircraftControlBoundary.ts` ferme les sorties physiques : commande actionneur, armement réel et téléversement de mission sont rejetés; le HIL est désactivé. Il autorise la simulation locale et une observation matérielle strictement en lecture seule.
- `frontend/client/src/components/MavlinkTelemetryPanel.tsx` présente un panneau d’observation en lecture seule et interroge une route de statut. La présence de ce panneau ne prouve pas, à elle seule, que le transport, le capteur ou les données sont raccordés et validés dans chaque environnement.

Ces éléments sont de bons points d’appui. Ils ne constituent pas une analyse FEA/CFD, un jumeau « as-built », une enveloppe de vol validée, une thermographie étalonnée ni une preuve de conformité.

## Recommandations par domaine

| Domaine | Modernisation concrète | Données / limites à rendre visibles |
|---|---|---|
| **Solidité et manœuvrabilité** | Ajouter un bilan de masse et de centrage traçable, les positions des équipements, les hypothèses géométriques et des cas de charge de projet explicitement sélectionnés. Distinguer contrôle de cohérence, estimation et analyse externe importée. | Géométrie adaptée, masses mesurées ou sourcées, position XYZ, propriétés matière directionnelles, cas de charge, hypothèses de fixation et méthode. Sans ces entrées, afficher « non calculé »; ne pas déclarer une cellule résistante ou apte au vol. |
| **Cockpit** | Construire une vue opérateur centrée sur l’état de la simulation, les alertes classées, l’âge des données, la provenance et les actions disponibles. Séparer très visiblement simulation, observation en lecture seule et données absentes. | Pas de commandes de pilotage réel. Les états périmés, incohérents ou déconnectés doivent être visibles et ne pas conserver l’apparence d’un état nominal. |
| **Vent et environnement** | Faire évoluer le banc virtuel actuel : scénarios paramétrables, direction et rafales distinctes, journal des hypothèses et comparaison répétable entre scénarios. À terme, permettre l’attachement d’une source météo avec lieu, horodatage, couverture et incertitude. | Les valeurs de vent de démonstration ne sont pas des limites universelles. La comparaison doit se faire avec une enveloppe propre au modèle et avec une méthode de calcul documentée; les sorties restent simulées et non opérationnelles. |
| **IDDS et Mechanical Twin** | Distinguer les niveaux « concept », « maillage », « paramétrique », « CAO de référence » et « pièce construite/inspectée ». Ajouter version, écarts entre révisions, liens entre assemblages, nomenclature et preuves d’inspection. | Un OBJ/STL ou une géométrie de primitives ne devient pas une CAO complète par simple import. Chaque niveau doit annoncer sa fidélité et ses limites. |
| **Observatoire de simulation** | Pour chaque exécution, conserver un manifeste : configuration/version, entrées et unités, version du moteur, scénario, date, hypothèses, résultats, contrôles et statut. Permettre la comparaison côte à côte et la répétition d’un scénario. | Identifier les modèles corrélés, les sorties indicatives et les plages d’incertitude. Un résultat reproductible n’est pas automatiquement un résultat physiquement exact. |
| **Modifications mécaniques et paramétriques** | Ajouter un graphe de dépendances entre paramètres et pièces, une prévisualisation des éléments affectés, une révision explicite, des opérations annulables et un résumé des impacts sur masse, centrage et simulation. | Ne pas annoncer de tolérances, de plans industriels ou d’export fabricant qualifié sans géométrie, références et contrôles spécifiques. Garder les exports conceptuels étiquetés comme tels. |
| **Vues thermiques** | Commencer par un visualiseur de mesures importées et horodatées, puis éventuellement des résultats d’un solveur identifié. Afficher l’échelle, les unités, les zones non mesurées et l’état d’étalonnage. | Une carte colorée générée sans capteur, données calibrées ou solveur documenté serait trompeuse. Ne pas convertir la couleur d’un matériau en température réelle. |
| **Bibliothèque des matériaux** | Séparer le catalogue des pièces de la base des matières. Ajouter fiche source, fabricant, référence, unité, plage d’emploi, directionnalité/stratification, lot, date, document technique et statut « déclaré / mesuré / vérifié ». Lier une matière à une pièce et à une révision. | Une fiche générique ou marketing ne vaut pas valeur de calcul admissible. Ne pas utiliser une propriété estimée comme propriété certifiée. Conserver la provenance de chaque valeur. |
| **Missions de défense** | Limiter l’intégration logicielle à des usages non armés : observation de situation, protection civile, recherche et sauvetage, journal d’événements, alertes de sécurité et coordination humaine. Le mode observation reste séparé de la simulation. | Pas d’armement, de ciblage, d’engagement, de guidage d’attaque, d’optimisation létale ou de commande autonome d’un aéronef. Conserver les interdictions de `aircraftControlBoundary.ts`. |

## Socle d’architecture recommandé

1. **Configuration de conception versionnée** : un identifiant de conception et une révision immuables relient architecture, géométrie, modules, masses et hypothèses.
2. **Niveaux de preuve normalisés** : `déclaré`, `estimé`, `mesuré`, `vérifié par revue`. Le terme « certifié » ne doit être employé qu’avec une autorité et une preuve appropriées, pas comme un badge calculé par l’interface.
3. **Provenance pour chaque résultat** : valeur, unité, origine, date, méthode, version du modèle et incertitude connue. Les unités SI sont stockées; les conversions sont d’affichage.
4. **Services métier séparés** : géométrie et masse/centrage; matériaux et nomenclature; environnement; simulation; thermique; revue et traçabilité. Les pages React ne doivent pas devenir le lieu où vivent les calculs.
5. **Porte de sécurité commune** : aucune modification de cette feuille de route ne réactive une commande physique, le HIL ou le téléversement de mission. Les essais restent locaux et simulés tant qu’un projet de sécurité distinct n’a pas été spécifié et validé par les personnes compétentes.
6. **Résultats explicables** : chaque indicateur expose pourquoi il est vert, en revue ou bloquant, et les entrées qui manquent. Un « pass » ne signifie pas « prêt au vol ».

## Ordre de réalisation proposé

### Tranche 1 — Socle de confiance et assurance de conception

Normaliser les états de preuve, unités, provenance et révisions; consolider les contrôles déjà présents dans `engineeringReview.ts`; ajouter le suivi des entrées manquantes et un manifeste d’exécution. C’est la première tranche recommandée, car elle conditionne tous les autres modules.

**Critères d’acceptation :** une valeur estimée ne se présente jamais comme mesurée; une donnée manquante ne produit pas un feu vert; chaque résultat renvoie à la révision et aux entrées qui l’ont généré; les commandes physiques demeurent rejetées par tests.

### Tranche 2 — Masse, centrage, mécanique et manœuvrabilité conceptuelle

Compléter les positions et révisions des composants, les liens entre pièces et les contrôles de cohérence. Rendre les résultats conditionnels aux données déclarées et ne pas les appeler validation structurelle.

### Tranche 3 — Twin, IDDS et inspections

Ajouter niveaux de fidélité, comparaison des révisions, pièces inspectées, écarts et liens vers les preuves. Le Twin devient un dossier numérique traçable, pas une affirmation que l’import est une CAO complète.

### Tranche 4 — Simulation et environnement

Versionner les campagnes et rendre les scénarios de vent plus explicites; distinguer scénario synthétique, données météo attachées et enveloppe propre à la cellule. Ajouter comparaison et répétabilité avant des visualisations avancées.

### Tranche 5 — Matériaux et thermique

Refondre la bibliothèque en matières + composants + références, puis n’afficher de vue thermique qu’à partir de mesures identifiées ou d’un calcul documenté.

### Tranche 6 — Cockpit unifié et missions non armées

Réunir alertes, état des données, historique et coordination humaine; ajouter les profils de protection civile/secours non armés tout en gardant le contrôle matériel verrouillé.

## Limites et décision pour la suite

Je peux contribuer à l’architecture logicielle, aux contrôles de cohérence, à la simulation conceptuelle, à l’ergonomie et aux tests. Je ne remplace pas un ingénieur aéronautique habilité, un laboratoire, une analyse FEA/CFD validée ou une autorité de certification. Aucun chiffre de sécurité de vol ne devrait être livré sans exigences, sources et méthode adaptées au modèle concerné.

**Périmètre de la présente livraison :** cadrage fondé sur une inspection statique de fichiers du dépôt. Aucun code applicatif n’a été modifié pour cette demande; la prévisualisation associée reste donc celle de la version actuelle. La revue n’est pas une vérification réglementaire externe.

**Étape suivante recommandée :** démarrer par la Tranche 1, dans le dépôt existant, après confirmation de ce périmètre. Les hypothèses par défaut seraient : simulation locale uniquement, missions non armées, aucune commande matérielle, et aucun statut de certification généré par AeroMinD.
