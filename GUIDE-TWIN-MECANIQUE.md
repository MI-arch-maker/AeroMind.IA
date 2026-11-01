# AeroMind — Twin mécanique paramétrique

Correction du 15 octobre 2026, réalisée à partir de l’archive `AeroMind-AI-Twin-presentations-final.zip`.

## Ce qui a changé

Dans **Digital Twin Explorer**, un drone explicitement sélectionné n’est plus présenté par le rendu de secours en boule CSS. Il est représenté par un **assemblage mécanique procédural**, composé de pièces distinctes, sélectionnables et modifiables.

- **Aucune rotation automatique** du drone ou des hélices dans cette scène de conception. L’orbite et le zoom répondent seulement à l’utilisateur.
- Géométries dédiées aux **21 morphologies actuellement exposées dans le catalogue**; le moteur couvre aussi les architectures spécialisées supplémentaires présentes dans les sources.
- Corps facettés, ailes extrudées, bras et supports, moteurs, pales, trains, modules et détails d’assemblage. Les références industrielles multirotor ouvertes ne reçoivent plus systématiquement des carénages de ducted-fan.
- Poste graphite/carbone/métal avec sélection, repères et cotes. La fenêtre Twin est maximisée par défaut pour une nouvelle préférence de fenêtre; les tailles déjà enregistrées restent respectées.
- **Même géométrie** en WebGL et en projection vectorielle de compatibilité. Le bouton **Compatibilité** permet de choisir explicitement le rendu sans GPU. Ce n’est ni une icône générique, ni une boule animée.

## Utiliser le Twin

1. Ouvrir **Bibliothèque de cellules**, choisir une architecture, puis ouvrir **Digital Twin Explorer**. Une référence industrielle chargée ouvre directement le Twin. Le bouton **Changer de cellule** reste disponible depuis l’atelier maximisé.
2. Utiliser les vues **ISO / DESSUS / FACE / PROFIL** et les modes **Solide / Filaire / X-ray**.
3. Activer **Éclaté** et régler l’espacement pour examiner l’assemblage. Cette présentation ne modifie pas la géométrie exportée.
4. Dans l’onglet **Cellule**, régler les dimensions globales, le nombre de motorisations, la section de fuselage, la flèche, le dièdre et le train. Les paramètres alaires agissent sur les architectures disposant d’ailes; ils ne créent pas des ailes sur une cellule qui n’en comporte pas.
5. Cliquer une pièce dans la scène ou l’arborescence, puis modifier son **nom, sa couleur, sa visibilité, ses dimensions locales, ses déplacements XYZ, ses rotations XYZ et ses échelles XYZ**.
6. Ajouter un **Module** cubique ou un **Cylindre**, puis l’éditer indépendamment. Les modules utilisateur peuvent être supprimés; les pièces procédurales peuvent être masquées et réinitialisées.
7. Utiliser **Annuler / Rétablir**, **Recentrer la caméra**, la réinitialisation de pièce ou celle du modèle.

Les géométries sont exprimées en mètres. Les dimensions de pièces tiennent compte de l’échelle de base des modules installés. Les bornes du moteur sont reflétées par les principaux champs; la diminution de l’envergure peut réduire le diamètre d’hélice à la limite d’affichage de cette architecture.

## Conserver et réutiliser les modifications

### Projet actif

Les paramètres mécaniques sont intégrés à `ConceptConfig` et au schéma de workspace existant. Les éditions de pièces sont rattachées à l’identifiant du drone dans `mechanicalTwins`; elles ne s’appliquent pas à une autre cellule. Les dimensions globales restent celles du concept actif; les sauvegarder dans un brouillon permet de les retrouver après un changement de référence.

La synchronisation distante dépend du serveur et de la session configurés dans l’installation d’origine. **Elle n’a pas été vérifiée sur un compte connecté dans l’aperçu temporaire.**

### Sans projet actif

Aucun projet n’est créé et aucun drone n’est sélectionné automatiquement. Les éditions restent temporaires tant que l’utilisateur ne les conserve pas explicitement :

- **Sauver brouillon** : stocke les dimensions et les réglages mécaniques de cette cellule dans le navigateur, sous une clé dédiée, sans écriture serveur.
- **Charger brouillon** : restaure manuellement le brouillon de la cellule déjà sélectionnée. Après rechargement, sélectionner de nouveau cette cellule, puis cliquer cette commande.
- **Configuration JSON** : télécharge les paramètres rééditables au format AeroMind v1.
- **Importer JSON** : restaure un fichier de ce format pour la cellule sélectionnée. Les fichiers invalides ou appartenant à un autre drone sont refusés.
- **Maillage OBJ** : exporte les pièces visibles, avec leurs transformations appliquées, dans le repère monde, en mètres, sans éclatement de présentation.

Les couleurs et réglages paramétriques sont conservés par le JSON; l’OBJ livré est un maillage géométrique triangulé, sans bibliothèque de matériaux MTL.

## Limites importantes

> Il s’agit de modèles mécaniques conceptuels paramétriques, et non des fichiers CAO propriétaires des constructeurs ni d’une validation de fabrication ou de vol.

- Le moteur ne fournit pas un solide B-rep ou un export STEP/IGES industriel. Les pièces sont modifiables au moyen des paramètres et transformations exposés; ce n’est pas un modeleur CAO généraliste à opérations booléennes.
- Un croquis utilisateur non calibré reste fidèlement en **2D**, sans conversion arbitraire en drone 3D.
- La nomenclature installée reste distincte des pièces du maillage conceptuel. Masquer une pièce de visualisation ne supprime pas un équipement ni sa masse du document métier.
- La nouvelle géométrie concerne le **Twin**; les autres consoles existantes ont été conservées.
- **L’ancienne URL n’a pas été modifiée** : cette tâche ne disposait pas d’un accès d’écriture à son serveur. La livraison est une archive complète corrigée et un aperçu temporaire séparé.

## Intégration dans l’installation existante

L’archive conserve les sources et ressources existantes. Les dépendances Node, les environnements virtuels, les caches et les secrets d’exécution ne sont pas inclus. Ne pas écraser les données, les bases ou la configuration d’authentification du serveur en remplaçant les fichiers applicatifs.

Le dossier `frontend/dist` contient le build statique corrigé. Pour le reconstruire :

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build:static
```

Pour un aperçu local de développement :

```bash
pnpm dev:static
```

Pour une installation complète, conserver les réglages backend/SSO de l’application existante et suivre son guide de déploiement fourni dans l’archive. Les commandes de frontend ne configurent pas le serveur ni le SSO.

## Vérifications réalisées

- Compilation TypeScript : `pnpm check`.
- Suite Vitest complète : **35 fichiers, 169 tests réussis**, dont 8 tests du moteur mécanique et 3 tests d’export/import de brouillons.
- Build statique : `pnpm build:static`.
- Aperçu local et public : HTTP 200; manifeste de routes conservé.
- Navigateur : sélection de DELUGE-E et de Matrice 350 RTK; ajout et renommage d’un module; déplacement, rotation, échelle, masquage et annulation; sauvegarde manuelle et restauration après rechargement; exports JSON/OBJ contenant les éditions; projection vectorielle stable sans mouvement automatique.

L’avertissement sur la taille du bundle principal reste non bloquant. Les tests logiciels ne constituent pas une qualification aéronautique.
