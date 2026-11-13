# Rapport — Centre Mécanique AeroMind

## Résultat
AeroMind dispose désormais d’un onglet natif **Centre Mécanique** distinct du Centre Paramétrique, du Digital Twin et de l’atelier de construction. Il est accessible depuis la navigation principale et par `/?view=mechanical-center`.

## Fonctions intégrées
Le centre propose une vue système, une nomenclature de pièces, un inspecteur d’installation, la filerie et ses chemins, les connecteurs et leur compatibilité documentaire, ainsi qu’un tableau de maintenance. Les états sont explicites : planifié, installé, inspecté, brouillon, à revoir et vérifié. Une pièce utilisateur peut être ajoutée, sélectionnée et mise à jour sans déclencher d’action de fabrication.

Les câbles décrivent l’origine, la destination, le bus, la section, la longueur, le chemin et l’état de séparation. Les connecteurs décrivent le type, les côtés A/B, le nombre de broches, le verrouillage documentaire et la compatibilité. Les actions de maintenance conservent l’intervalle, l’outil, l’accessibilité et le statut.

## Intégration et persistance
Le bloc `mechanicalCenter` est porté par `ConceptConfig` et accepté par le schéma de snapshot existant. Les mises à jour sont locales au projet et compatibles avec les sauvegardes AeroMind déjà en place.

## Sécurité et limites
Le centre est strictement documentaire et virtuel. Le verrou **VIRTUAL ONLY / MATÉRIEL DÉSACTIVÉ** est visible dans l’interface. Aucun transport MAVLink, socket, port, actionneur, fabrication, commande, certification ou autorisation réglementaire n’est ouvert par cette modification. Les métriques et contrôles restent indicatifs jusqu’à revue humaine et rattachement à des sources vérifiées.

## Vérifications
- TypeScript : réussi (`tsc --noEmit`).
- Build Vite : réussi.
- Manifeste `manus-routes.json` : JSON valide et route Centre Mécanique présente.
- Contrôle des marqueurs : import, navigation, résolveur de vue, modèle et rendu présents.
- Test matériel : aucune modification des modules de transport ou de commande physique.

## Fichiers principaux
- `frontend/client/src/components/MechanicalCenter.tsx`
- `frontend/client/src/components/mechanical-center.css`
- `frontend/client/src/lib/mechanicalCenterModel.ts`
- `frontend/client/src/lib/aeroEngine.ts`
- `frontend/client/src/lib/projectSyncStore.ts`
- `frontend/client/src/pages/Home.tsx`
- `frontend/client/src/lib/homeViewRouting.ts`
- `frontend/client/public/manus-routes.json`

## Extension turbo — atelier mécanique

Le Centre Mécanique comprend maintenant quatre ateliers supplémentaires :

- **Atelier manuel** : création de pièce libre, gabarit de fixation et élément moteur documentaire.
- **Assemblage** : contraintes de contact, concentricité, parallélisme et relations entre pièces, avec états « à vérifier », « satisfaite » et « conflit ».
- **Visserie** : boulons, vis, écrous, rondelles et entretoises avec taille, matériau, quantité, couple indicatif et état de montage.
- **Graissage** : points de lubrification, cible, produit à préciser, quantité, intervalle et accessibilité.

Ces nouveaux états sont persistés dans `mechanicalCenter` au sein du `ConceptConfig`. Ils restent des données d’atelier virtuel. Le logiciel ne revendique pas de solveur industriel de contact ou de résistance, de couple certifié, de procédure de graissage validée, de fabrication assistée, d’achat ou de mise sous tension.

## Vérification de cette extension

Le typecheck TypeScript, le build Vite et la suite frontend ont réussi : **77 fichiers de tests et 367 tests**. Le verrou `VIRTUAL ONLY / MATÉRIEL DÉSACTIVÉ` est conservé.

## Refonte Mechanical Workbench

La coque principale du Centre Mécanique est maintenant alignée sur l’architecture professionnelle du Centre Paramétrique :

- barre de menus et barre d’outils d’ingénierie;
- arbre d’assemblage avec design Mechanical Twin, sous-ensembles, pièces manuelles et révisions;
- viewport central 3D connecté au design actif, sélection synchronisée et vue éclatée réglable;
- modes Part Studio mécanique, Assembly, Filerie & Connectique et Maintenance;
- inspecteur contextuel avec onglets Identité, Géométrie, Assemblage, Interfaces et Maintenance;
- annuler/rétablir, enregistrement local, création de pièce, mesure documentaire, variante et plein écran;
- diagnostics et statut local conservés dans la barre inférieure.

Le nouveau composant principal est `frontend/client/src/components/MechanicalWorkbench.tsx`, avec ses styles dans `mechanical-workbench.css`. L’ancien modèle de données du Centre Mécanique reste la source persistante et les fonctions de filerie, connecteurs, visserie et graissage restent accessibles dans le même workspace.

## Vérification de la refonte

- TypeScript : réussi.
- Build Vite : réussi.
- Suite frontend : **77 fichiers, 367 tests réussis**.
- Preview : `/api/health` OK et route `/?view=mechanical-center` servie.
- Bundle : marqueur `MECHANICAL WORKBENCH` présent.
- Aucune modification de transport matériel ni d’activation de sortie physique.

## Recalibrage dimensionnel

Les interfaces du Workbench sont maintenant dimensionnées selon l’espace réellement disponible :

- desktop : colonnes fluides avec arbre borné, viewport central prioritaire et inspecteur borné;
- hauteur : `clamp()` et ratio 16:9 pour le viewport, avec limites empêchant le débordement vertical;
- tablette : deux colonnes, inspecteur déplacé sous le workspace et onglets défilables;
- mobile : empilement arbre, viewport et inspecteur, barre d’outils horizontale et viewport 4:3.

Le recalibrage est contenu dans `frontend/client/src/components/mechanical-workbench.css` et ne modifie ni les contrats de données ni la séparation virtuelle/matérielle.

## Modernisation commande : gouvernance physique indépendante

Un panneau `PhysicalControlGovernancePanel` est désormais intégré à Mission Operations. Il permet de documenter une demande contextualisée par projet, drone, commande et fenêtre temporelle, puis de parcourir visuellement la chaîne :

`Utilisateur → GATE 01 → GATE 02 → GATE 03 → GATE 04 → code de transmission → Super-Administrateur`.

Le panneau fournit :

- progression séquentielle des GATE;
- génération locale d’un code d’identification après GATE 01–04;
- journal de session avec auteur, heure, action et résultat;
- expiration documentaire et révocation;
- indication explicite `PHYSICAL OUTPUT: FALSE`.

La fonction ne délivre pas d’autorisation matérielle. MAVLink, WSS externes et actionneurs restent désactivés dans la Preview. Une décision GATE 05, même favorable, ne déverrouille pas automatiquement la couche matérielle indépendante.

## Correctif Filerie & Connectique / LABBENCH MFA

L’onglet Filerie & Connectique n’est plus un écran d’attente. Il propose désormais :

- une liste de câbles avec bus, origine, destination, longueur et état de séparation;
- un éditeur de route pour section, chemin, points de maintien et statut de revue;
- création et suppression de câbles documentaires;
- une liste de connecteurs avec brochage, côtés A/B, verrouillage et compatibilité;
- création et édition de connecteurs;
- compteurs de routages à revoir et de conflits de séparation;
- persistance dans `ConceptConfig.mechanicalCenter`, sans liaison électrique ou physique.

Concernant LABBENCH 01, le TOTP reste obligatoire pour les rôles Admin et Super-Admin. Le contournement demandé n’est pas activé, car il supprimerait le second facteur d’un compte privilégié. L’interface indique maintenant explicitement cette règle.
