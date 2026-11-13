# AeroMind — extension haute vitesse simulée et Mission Planner GPS

**Date :** 30 octobre 2026  
**Périmètre :** saisie de vitesse de conception, modèles AeroMind/AeroLab, planification locale et validation WGS84.

## Résultat

Les interfaces de conception acceptent maintenant une **cible théorique jusqu’à 650 km/h**. Cela permet d’étudier une entrée supérieure à 500 km/h, mais **ne prouve pas qu’une plateforme réelle peut atteindre cette vitesse**. Les modèles AeroMind signalent toute cible dépassant 216 km/h comme hors calibration; le modèle de voilure fixe signale également les conditions au-delà de Mach 0,3, car il ne calcule pas la compressibilité.

Les vitesses de planification sont volontairement distinctes des cibles de conception : les plans de mission locaux et les waypoints générés sont plafonnés à 300 km/h, et la validation pré-vol locale bloque une configuration de mission au-delà de cette enveloppe. Le manifeste Render garde `HARDWARE_CONTROL=false`. Aucun contrôle ni aucune commande ne sont envoyés à un aéronef par les changements ci-dessous.

## Modifications livrées

- Extension cohérente des entrées de vitesse conceptuelle à 650 km/h dans les interfaces de conception, Home, AeroLab, l’adaptateur projet→AeroLab et la simulation locale; conversion km/h ↔ m/s conservée et testée.
- Garde-fou dans le moteur de conception : au-dessus de 216 km/h, les métriques de performance passent en revue/indicatives, un risque haute vitesse est ajouté et la confiance reste indicative. AeroLab ne peut pas afficher `PASS` hors de son domaine de vitesse calibré.
- Ajout du nombre de Mach à la carte aérodynamique. L’estimation incompressible signale explicitement les résultats au-delà de Mach 0,3.
- Découplage de la cible de conception et de la vitesse maximale du plan opératoire dans Home. Les plans et gabarits sont plafonnés à 300 km/h; un pré-vol local haute vitesse est bloqué plutôt que présenté comme valide.
- Ajout d’un onglet **GPS** au Mission Planner : saisie WGS84 décimale, latitude/longitude validées, nom facultatif, insertion volontaire au plan local, recentrage de la carte et synchronisation au projet actif. Si aucun plan n’a été modifié ou enregistré, l’exemple d’itinéraire est écarté au premier ajout afin d’éviter de mélanger une coordonnée utilisateur à la mission de démonstration.
- La saisie GPS n’envoie pas de mission à un drone. L’API valide les couples WGS84 à la création/modification et avant upload; les coordonnées partielles, hors plage, NaN ou infinies sont rejetées. Les commandes MAVLink sans mapping exact sont bloquées au lieu d’être converties silencieusement en waypoint générique.
- Remplacement dans Mission Planner des valeurs météo et des statuts « validé » codés en dur par des libellés explicites « non chargé / simulation locale »; distance et durée d’aperçu calculées depuis les points visibles; télémétrie renommée « simulée ».
- Styles responsives/focus pour le formulaire GPS; règles Docker corrigées afin que les images publiques nécessaires ne soient pas exclues du contexte de build.

## Vérifications effectuées

- `pnpm check` : **réussi** (catalogues i18n synchronisés, contrôle TypeScript réussi).
- `pnpm test` : **65 fichiers, 315 tests réussis**.
- `pnpm build` : **réussi**. Vite affiche deux avertissements non bloquants : la balise `/api/platform/config.js` est conservée comme script runtime externe (elle est servie par FastAPI), et plusieurs chunks dépassent le seuil d’avertissement de taille. Le bundle de production est bien généré.
- Backend : `py_compile` réussi; **32 tests réussis, 1 test ignoré**, dont les régressions de création de projet, persistance, bornes WGS84, refus des commandes MAVLink non mappées, limite SI de vitesse et workflow.
- Le manifeste Render a été inspecté : service Docker, health check `/api/ready`, `autoDeploy: false` et `HARDWARE_CONTROL=false`.

## Limite de portée

La compilation et le contrat Render ont été vérifiés localement; aucun déploiement ni test navigateur sur un service Render en ligne n’a été déclenché. Une cible simulée >500 km/h demeure une **entrée d’étude**, pas une performance opérationnelle qualifiée. L’onglet GPS conserve le point dans le plan local, sans transmission au véhicule.
