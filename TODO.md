# Cahier des charges — Twin Construction, CAO et Compositing

## Intégration approuvée C + A + B

- [ ] **Assembly & Materials Twin :** afficher un dock intégré au Mechanical Twin avec une nomenclature dérivée des pièces visibles, un statut local par pièce, un matériau associé, une progression de construction et une alerte claire lorsque les données restent indicatives.
- [ ] **Séquence d’assemblage :** permettre de marquer les pièces dans l’ordre de construction, de filtrer les pièces non montées et de conserver l’état par cellule sans créer d’accès matériel.
- [ ] **AeroCAD Parametric :** fournir des mesures dérivées de la géométrie active, une cote de référence, une tolérance indicative, un mode de coupe/revue et des variantes locales comparables.
- [ ] **Twin Compositing Studio :** fournir des calques manuels persistants avec visibilité, verrouillage, sélection, suppression, couleur d’accent et affectation de la pièce courante; ne créer aucun calque automatiquement par effet secondaire.
- [ ] **Source unique :** les trois espaces doivent lire le même modèle paramétrique et la même pièce sélectionnée, sans modifier la géométrie lorsque l’utilisateur consulte un onglet.
- [ ] **Limites et sécurité :** conserver les mentions conceptuelles, séparer la géométrie procédurale de la nomenclature et ne fournir aucune commande matérielle, mission ou action physique.
- [x] **Validation :** `pnpm check`, tests Vitest, build statique, aperçu public HTTP 200 et archive ZIP finale contrôlée.

## Demande — barre de rendus personnalisés Studio IDDS / Assemblage numérique

- [x] **Barre de rendus :** retirer le libellé et le rendu « Aperçu 2D » de l’interface Assemblage numérique et proposer une barre avec « Assemblage mécanique complet », « Détails mécaniques internes », « Cinématique et mouvements », « Simulation paramétrique » et « Générateur de variantes paramétriques » ; chaque bouton sélectionne un mode réel, accessible et clairement actif.
- [x] **Source unique et édition :** les cinq modes lisent les pièces visibles du drone et le document/configuration active ; la sélection de pièces et l’inspecteur restent liés au même drone, et les changements de vue ne créent ni ne substituent de modèle caché.
- [x] **Fonctions paramétriques :** la cinématique offre une commande de lecture/pause ; la simulation offre des paramètres interactifs appliqués au drone actif et affiche la masse indicative ; le générateur crée des variantes sélectionnables dont les paramètres modifient le document actif.
- [x] **Limites affichées :** distinguer le mouvement visuel des commandes physiques et signaler que les mesures, masses et résultats sont conceptuels/indicatifs, non certifiés.
- [x] **Validation :** vérification TypeScript, tests existants, compilation statique et archive ZIP finale contrôlée ; ne pas déclarer un déploiement distant sans connecteur ou destination fournis.

- [x] **Édition des drones de bibliothèque :** attacher les événements pointer au viewport IDDS du document actif ; sélectionner et déplacer par glisser-déposer les pièces non verrouillées, publier leurs coordonnées par la synchronisation de configuration et réinitialiser les pièces lorsque l’identifiant de cellule de bibliothèque change ; conserver une vue de source lisible sans étiquettes superposées.

## Limites

Le Twin reste un modèle mécanique conceptuel paramétrique. Les matériaux, couples de serrage, tolérances, statuts et mesures sont indicatifs ou saisis par l’utilisateur; ils ne constituent ni une qualification aéronautique, ni une validation de fabrication, ni une certification.


## Demande — modernisation approfondie d’IDDS / Assemblage numérique

- [x] **Architecture séparée :** moderniser largement l’interface « IDDS / Assemblage numérique » sans réutiliser l’éditeur complet du « Digital Twin Explorer »; conserver la séparation précédente et n’échanger que le modèle/viewport géométrique de bas niveau.
- [x] **Barre d’outils riche :** proposer des commandes de sélection, translation, rotation, échelle, mesure, création de composants, copie, suppression, masquage, vues, grille/accrochage et historique annuler/rétablir; chaque commande visible est reliée à une action.
- [x] **Édition mécanique :** permettre la modification des transformations XYZ des pièces, dimensions principales et paramètres structuraux avancés, matériau/finition et couleur; actualiser le maillage actif depuis le document IDDS sélectionné.
- [x] **Calques et assemblages :** créer et affecter des calques, contrôler visibilité/verrouillage/couleur/opacité, ajouter des primitives paramétriques et afficher l’arbre de pièces et les propriétés de la sélection.
- [x] **Outils d’image :** importer une image locale de référence et régler sa visibilité, opacité, échelle et rotation comme calque visuel de guide; ne pas la présenter comme géométrie certifiée ni l’envoyer au serveur.
- [x] **Inspection et sorties :** garder les projections, la coupe X-ray, la vue éclatée et la cinématique; proposer des exports OBJ/STL étiquetés conceptuels et des mesures dérivées du modèle.
- [x] **Limites et ergonomie :** conserver les limites de simulation/qualification visibles et adapter les panneaux aux petits écrans sans retirer les fonctions accessibles.
- [x] **Validation finale :** typecheck, tests Vitest, build statique, contrôle de la scène 3D et test navigateur « ajouter un bloc → annuler » avec retour de l’arbre de 34 à 35 puis 34 pièces; contrôle i18n sans nouvelles alertes propres à IDDS.


## Demande — navigation cartographique et simulation locale d’inspection

- [x] **Itinéraire civil local :** permettre d’ajouter des points sur la carte ou par coordonnées, de les renommer comme points d’inspection et de les supprimer ; conserver le brouillon dans le navigateur par utilisateur et cellule. Les modifications de route réinitialisent la démonstration et sont verrouillées pendant sa lecture.
- [x] **Imagerie :** conserver le fond satellite et le fond cartographique, et proposer un filtre nocturne purement visuel avec état accessible et indication explicite qu’il ne s’agit pas d’un capteur de vision nocturne.
- [x] **Démonstration :** avec au moins deux points, démarrer, mettre en pause, reprendre, terminer ou réinitialiser une progression locale ; afficher un marqueur et une barre de progression générés uniquement dans le navigateur.
- [x] **Limites impératives :** aucun armement, ciblage, poursuite, commande de pilotage, actionneur, lecture GNSS embarquée, téléversement de route ou écriture MAVLink ; conserver la télémétrie en lecture seule et identifier la simulation comme non transmise.
- [x] **Validation :** `pnpm check`, 239 tests Vitest et build statique réussis. `pnpm i18n:lint` reste en échec sur des diagnostics présents dans d’autres fichiers ; aucun diagnostic ne vise les composants cartographiques modifiés. Archive mise à jour préparée sans prétendre à un déploiement distant.


## Demande — journal de validation détaillé persistant et synchronisé

- [x] **Journal utile :** remplacer le flux synthétique qui simulait une activité périodique par des événements enregistrés seulement lorsqu’une action humaine ou une revue intervient. La checklist peut être sauvegardée avec son instantané détaillé.
- [x] **Synchronisation projet-scopée :** conserver les traces non envoyées dans une file locale récupérable, distinguer visuellement « local/en attente » et « confirmé par le serveur », rejouer de façon idempotente, protéger la lecture et l’écriture par l’authentification et la propriété du projet, et fournir un rafraîchissement/réessai explicite.
- [x] **Garde-fou :** l’API n’accepte que `validation.action`/`validation.checkpoint` marqués `local-simulation-only` et `physicalOutputEnabled=false`; aucun événement d’audit n’est une commande d’aéronef ni une preuve d’essai physique.
- [x] **Détails :** les checklists enregistrées exposent leurs contrôles, états, niveaux et messages en volet dépliable; les événements serveur et les brouillons locaux sont clairement séparés.
- [x] **Validation :** `pnpm check`, 241 tests Vitest, build statique et 37 tests Python réussis. Contrôles de catalogues français/anglais passés. Le linter i18n global signale encore des textes hérités hors des composants modifiés; aucun diagnostic ne vise `ValidationAuditJournal.tsx` ou le nouveau panneau de synchronisation.
- [ ] **Mise en production :** pour une base TiDB déjà utilisée, appliquer `migrations/2026-10-21_validation_audit_events.sql` avant de déployer; aucune base distante n’a été modifiée ni aucun déploiement déclenché dans cette livraison.
