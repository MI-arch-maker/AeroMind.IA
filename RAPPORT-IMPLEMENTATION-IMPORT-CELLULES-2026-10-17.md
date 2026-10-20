# AeroMinD — amélioration de l’import de maquettes OBJ/STL

**Date :** 17 octobre 2026

## Changements effectués

- L’import n’essaie plus d’inférer automatiquement une architecture à partir du seul rapport de dimensions. L’utilisateur choisit explicitement voilure fixe, multirotor, VTOL ou « autre / indéterminée ».
- L’utilisateur peut associer les axes X/Y/Z de la maquette à l’envergure, à la longueur et à la hauteur. Les axes doivent être distincts ; les dimensions sont converties selon l’unité sélectionnée et les valeurs nulles ou supérieures à 30 m sont refusées avec un message de vérification.
- Ajout d’un aperçu 3D interactif du maillage OBJ/STL source avec Three.js. Le maillage est centré et mis à l’échelle pour l’affichage. Le composant indique explicitement que cet aperçu n’est pas intégré à la variante paramétrique.
- Les résultats montrent les trois dimensions déclarées, l’architecture sélectionnée et le profil catalogue qui sert de base. Le pourcentage de « correspondance » a été retiré de cette expérience, car il pouvait être interprété à tort comme une mesure de similarité géométrique.
- Les profils importés restent enregistrés localement, avec IndexedDB en stockage principal et un repli `localStorage` pour compatibilité. Au chargement, les profils historiques localStorage sont fusionnés avec les profils IndexedDB.
- Ajout des commandes d’exportation et de restauration JSON des profils paramétriques. Les fichiers de maillage ne sont volontairement pas inclus dans ces exports.
- Les avertissements précisent que le profil catalogue demeure une approximation, que la géométrie source n’est pas conservée dans la variante et que l’outil ne réalise ni validation structurale ni certification aéronautique.

## Limites restantes

L’aperçu ouvre et affiche les fichiers OBJ/STL, mais les modèles source ne sont pas persistés après la session et ne sont pas convertis en pièces paramétriques natives. Les dimensions sont une boîte englobante selon les axes attribués par l’utilisateur ; l’architecture et les paramètres non mesurés restent à vérifier. L’export JSON ne sauvegarde que les profils paramétriques, pas les maillages.

Un import CAO fidèle (par exemple STEP, assemblages, topologie et modifications solides) reste un chantier distinct nécessitant un moteur CAO adapté. Cet import ne saurait à lui seul valider la structure, la sécurité ou l’aptitude au vol.

## Vérifications

- Tests ciblés de l’import et du workflow : 7/7 réussis.
- Suite frontend complète : 43 fichiers, 206 tests réussis.
- Vérification TypeScript (`tsc --noEmit`) : réussie.
- Build de production Vite : réussi. L’outil affiche un avertissement concernant la taille du bundle principal (4,44 Mo minifié), sans échec de compilation.

## Modernisation de l’interface « Dessiner un drone »

- Remplacement de la rangée d’outils par une palette verticale inspirée des éditeurs graphiques, organisée en groupes : navigation, dessin, formes, cellule, annotation et style. Chaque commande dispose d’un libellé accessible, d’un état actif et, le cas échéant, d’un raccourci clavier.
- Conservation des outils existants (sélection, crayon, ligne, rectangle, ellipse, aile, fuselage, empennage, charge utile, cotation, texte et gomme) et ajout de trois fonctions opérantes : déplacement de la vue par glisser-déposer, pipette qui reprend la couleur d’un objet et remplissage des formes/pièces fermées avec la couleur active.
- Le remplissage refuse les objets non fermés et les calques verrouillés. Le déplacement de la vue fonctionne aussi lorsqu’il commence sur un objet. Les commandes zoom, recentrage, annulation, rétablissement, duplication, grille, magnétisme et symétrie restent accessibles dans la barre d’actions supérieure.
- La barre passe en disposition horizontale défilante sur les petits écrans. Les outils restent des commandes de l’atelier et ne prétendent pas offrir des fonctions de retouche photo qui ne sont pas utiles au dessin de cellule.

### Vérifications complémentaires

- Le navigateur de prévisualisation détecte les 15 outils dans les six groupes de la palette.
- Essai interactif du remplissage sur une pièce paramétrique de test : la couleur active a été appliquée à la forme.
- Essai interactif de la pipette : la couleur du trait a été prélevée et l’outil est revenu à la sélection.
- Suite frontend : 43 fichiers, 206 tests réussis ; TypeScript sans erreur ; build de production réussi (avertissement préexistant de taille du bundle principal).
## Cycle de conservation des profils importés

- Chaque nouveau profil OBJ/STL est conservé localement avec le statut **en évaluation**; il n’est plus chargé automatiquement comme configuration active.
- Les fiches importées présentent les commandes **Mettre en évaluation**, **Conserver dans la bibliothèque** et **Supprimer**. Tant que la conservation n’est pas explicitement confirmée, les commandes de synchronisation et de création de variante restent désactivées.
- La conservation ouvre une boîte de confirmation accessible, enregistre l’état et charge ensuite le profil dans la configuration de travail. La suppression demande également confirmation et cible uniquement la copie locale de la Bibliothèque; une configuration de projet déjà créée reste intacte.
- Les statuts sont stockés avec le profil dans IndexedDB/localStorage et inclus dans l’export JSON. Pour éviter de considérer comme acceptés des profils importés depuis une autre sauvegarde, leur restauration les remet en évaluation. Les profils plus anciens, sans statut, sont eux aussi migrés vers « en évaluation ».
- Le workflow est un contrôle local et une étape de revue humaine. Il ne constitue pas une validation technique, une certification ou une autorisation de vol; aucune revue partagée par serveur n’est créée.

### Validation de cette livraison

- Tests de l’import et du workflow des statuts : 7 réussis.
- Suite frontend complète : 43 fichiers, 206 tests réussis.
- Vérification TypeScript : réussie.
- Build de production : réussi; l’avertissement sur le bundle principal de grande taille demeure.
