# Livraison — Correction du rendu Virtual Factory AeroMind.IA

**Date :** 11 novembre 2026  
**Périmètre :** Virtual Factory / Aperçu, en particulier le Drone Workspace après sélection d’une cellule.

## Correctif de rendu

Le défaut signalé provenait du fait que Virtual Factory utilisait encore `PhysicalDroneModel`, le rendu conceptuel simplifié, une fois le profil sélectionné. Le composant est remplacé dans l’atelier par le générateur paramétrique partagé AeroMind (`buildMechanicalModel`) et son viewport `MechanicalTwinViewport`, qui utilise les maillages mécaniques assemblés propres au profil sélectionné. Aucune cellule n’est rendue avant sélection.

Après sélection, l’atelier propose les vues conceptuelle, isométrique et orthographiques en plan/dessus, face et profil; un affichage solide ou filaire; une vue éclatée; une grille; et des curseurs pour l’envergure, la longueur du fuselage, la corde et le diamètre d’hélice. Les dimensions sont reprises du profil et modifient le modèle en direct. Les vues métriques affichent les longueurs réelles en mètres ainsi qu’une échelle de plan configurable (1:10, 1:25, 1:50 ou 1:100), nominale à 96 ppp pour l’affichage écran. Cette échelle d’interface ne remplace pas un dessin certifié à imprimer.

La sélection de l’architecture et les paramètres restent présents lors de la navigation interne hors de l’atelier. Effacer retire la sélection et revient à l’état vide. Les libellés du nouvel atelier sont harmonisés en français.

## Vérifications effectuées

`pnpm check` a réussi après le changement; le build frontend a réussi; les tests Vitest ont réussi (81 fichiers, 385 tests). Les routes Virtual Factory, Admin et Super-Admin répondent HTTP 200 à l’aperçu. Le navigateur a exercé la sélection de NIMBUS-01 et l’activation des vues isométrique et plan/dessus; les annotations de géométrie indiquaient 39 pièces maillées, 6 moteurs, une envergure de 1,20 m et une longueur de 0,62 m. Les commandes de vue, le changement de sélection et le rendu maillé ont ainsi été observés sur la prévisualisation.

## Limites

Il s’agit d’une maquette mécanique paramétrique destinée à la conception et à l’aperçu, non certifiée, non prête à la fabrication sans validation d’ingénierie et sans connexion aux équipements. La validation navigateur n’est pas un test E2E authentifié des API serveur. Le build conserve des avertissements non bloquants sur la taille des bundles.
