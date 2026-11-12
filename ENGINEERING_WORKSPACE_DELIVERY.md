# Livraison — Centre intégré d’ingénierie et d’industrialisation

**Date :** 12 novembre 2026  
**Projet :** AeroMind-IA fourni par l’utilisateur (`Aeromind-IA.zip`)  
**Route de prévisualisation :** `/?view=engineering-hub`

## Résultat

Le Hub a été remplacé par un poste de travail intégré lié à la configuration du projet actif : arborescence projet, atelier CAO, inspecteur, nomenclature des pièces, matériaux référencés, dossier technique modifiable et plan d’usine numérique éditable. Les autres centres AeroMind restent accessibles comme outils métier secondaires.

### Atelier CAO / cellule

Le centre réutilise `buildMechanicalModel` et `MechanicalTwinViewport` alimentés par le profil réellement choisi dans le catalogue AeroMind, ou par la géométrie éditée du twin. L’aperçu d’un drone de catalogue est explicitement marqué **aperçu non appliqué** et ne modifie pas le projet tant que l’utilisateur n’a pas confirmé son chargement. Les quatre vues, trois présentations mécaniques, sélection de pièces, rendus techniques existants et commandes de coupe/explosion disponibles dans le viewport sont raccordés au même modèle; les déplacements d’édition actifs utilisent les données de twin existantes.

### Pièces et matière

L’inspecteur de pièce affiche les identifiants et catégories du mesh, son nombre de sommets et triangles et ses dimensions de maquette; il ne transforme pas ces données conceptuelles en plans certifiés ou en mesures d’une pièce fabriquée. Les affectations choisissent les entrées de la bibliothèque matériaux AeroMind. Elles restent des **références projet non vérifiées** et ne signifient pas que la matière est achetée, reçue, inspectée ou présente physiquement. Le bouton d’export produit une nomenclature CSV à partir des composants du modèle et des affectations sélectionnées.

### Dossiers et documents

Un sous-document versionné `ConceptConfig.engineeringWorkspace` stocke les dossiers imbriqués, documents, postes conceptuels et affectations. La sauvegarde emprunte la chaîne canonique `Home` (normalisation et persistance du projet); aucun second stockage ou endpoint de production n’a été ajouté. Les opérations fournies comprennent créer dossier imbriqué, renommer, suppression récursive (avec avertissement et suppression des documents enfants), créer note/instruction/inspection, modifier leurs noms et textes, et exporter une sauvegarde JSON lisible. Les validations limitent les tailles/quantités et assainissent les données persistées.

### Usine numérique

Le plan visuel est une organisation **conceptuelle**, personnalisable avec postes, type, position relative, affectations de pièces à des postes et étapes déclaratives de gamme. La structure et les affectations restent liées aux pièces du modèle affiché. Les changements se conservent dans le projet avec le statut de sauvegarde remonté par `Home`. La gamme couvre jusqu’à 80 lignes visibles et un avertissement dirige vers l’export CSV pour consulter les composants additionnels.

## Limites d’intégration physique

Cette livraison ne crée ni équipement matériel, ni jumeau d’usine validé, ni plan d’implantation coté, ni contrôle de machines, robot, PLC, MES ou ERP. Elle ne prouve ni disponibilité, achat, réception, composition métallurgique, dimensions physiques, tolérances, temps de cycle ou qualité. Les plans de gamme et les étapes sont des déclarations manuelles de travail, pas des opérations d’atelier exécutées. Tout raccordement réel exigera des références d’usine, protocoles, modèles CAO de fabrication, équipements/connecteurs, mesures, contrôle des accès et validation de sûreté propres au déploiement.

Il n’y a pas de projet automatiquement créé. Dans l’état initial sans cellule, aucun composant de catalogue n’est rendu; le profil se choisit explicitement dans le menu, puis il faut l’action **Charger** pour construire le modèle. Sans projet actif et backend d’enregistrement disponible, les modifications sont limitées au brouillon local/à la session selon l’état indiqué dans l’interface. L’authentification SSO et l’écriture serveur dépendent du déploiement existant et ne sont pas remplacées par le présent travail.

## Validations exécutées

- `pnpm run check` : réussite (TypeScript et vérification des 2 617 clés de catalogues de langue).
- Tests ciblés : 22 tests réussis pour le modèle Workspace, le maillage mécanique et les engines existants.
- Tests de régression ciblés : 7 tests réussis pour l’aperçu paramétrique et les dossiers Workspace.
- `pnpm run build` : build de production réussi. Vite avertit que certains chunks applicatifs dépassent la limite de taille configurée; ce n’est pas une erreur de compilation.
- Preview Vite isolé du précédent workspace, route `?view=engineering-hub`, réponse HTTP 200; contrôle interactif navigateur des vues CAO et usine conceptuelle, de la liste de pièces, de l’inspecteur et du formulaire d’ajout de poste.

**Conclusion :** le centre logiciel de construction/conception et l’organisation d’une usine numérique conceptuelle sont livrés. Cela ne constitue pas une intégration d’une usine physique ou un dossier de fabrication certifié.


## Passe ergonomique — 12 novembre 2026

Le centre s’ouvre à présent comme espace maître plein écran et remplace l’ancienne géométrie de sous-vue sauvegardée. L’interface utilise le viewport disponible, avec une hiérarchie explicite : contexte projet/cellule, sélection explicite, espaces de travail, arborescence latérale, zone CAO centrale, inspecteur et état de sauvegarde. L’arborescence et l’inspecteur sont rabattables pour dégager la surface centrale; les panneaux, listes et canvas s’adaptent en hauteur et sur écran étroit.

**Règle du modèle neutre :** il n’y a pas de profil pré-sélectionné, pas de fallback vers le premier élément du catalogue, et aucun `MechanicalTwinViewport` n’est monté avant sélection/dessin actif. Le menu propose des profils mais choisir un item à lui seul ne matérialise pas un drone : il faut cliquer sur **Charger**. Un modèle déjà explicitement sélectionné ou un dessin antérieur fourni par le profil demeure réutilisé.

### Vérification de cette passe

- `pnpm run check` : réussite.
- `vitest` : 21 tests ciblés réussis, incluant l’état Hub sans modèle ni canvas 3D, la réouverture pleine page malgré un ancien layout mémorisé, les dossiers, et les géométries réutilisées.
- `pnpm run build` : réussite.
- Preview navigateur : le Centre apparaît en espace maître plein écran; le menu commence sans profil sélectionné. Sélectionner un profil sans cliquer sur Charger laisse l’espace CAO vide et l’inspecteur sans pièce.
