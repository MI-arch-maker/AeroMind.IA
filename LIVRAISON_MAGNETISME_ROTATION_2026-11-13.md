# Livraison — magnétisme et rotation commune

## Audit du magnétisme

Le viewport partagé `MechanicalTwinViewport` applique toujours `snapPartDelta` avant chaque déplacement persisté. Les trois modes existants sont conservés : composants + grille, axes voisins et grille métrique. Le magnétisme reste réglable indépendamment du rendu et de la rotation ; son activation, son mode et son pas ne sont pas réinitialisés par la nouvelle commande.

Les centres Parametric, Mécanique, Twin et Studio IDDS utilisent ce même chemin de viewport. IDDS conserve en plus son accrochage des champs numériques, et le déplacement verrouillé par couche continue de bloquer toute écriture interdite.

## Commande ajoutée

Le panneau de rendu commun contient désormais le bouton « Rotation sur elle-même ». Il agit sur l’axe vertical du drone et peut être arrêté par le même bouton. En WebGL, la commande active `OrbitControls` avec un cycle de rendu continu. En projection vectorielle de secours, elle anime le même maillage projeté ; aucune géométrie de remplacement n’est introduite.

La commande est donc disponible dans les quatre centres via leur viewport commun, sans changement de l’arborescence AeroMind ni de la projection vectorielle de secours.

## Vérifications

Le contrôle `pnpm run check`, les tests ciblés magnétisme/viewport/centres et le build production passent. La suite complète est relancée avant livraison finale pour contrôler l’absence de régression.
