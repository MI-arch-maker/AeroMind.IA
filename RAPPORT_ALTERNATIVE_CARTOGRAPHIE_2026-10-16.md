# AeroMind — alternative cartographique ouverte

## Décision

La vue « Navigation satellite » ne dépend plus de la configuration Google Maps existante. Elle utilise désormais un composant local léger qui affiche des tuiles CARTO basées sur OpenStreetMap directement dans le navigateur, avec attribution visible « © OpenStreetMap contributors © CARTO ».

Cette solution évite la clé Google pour cette sous-vue, réduit la dépendance à un SDK cartographique lourd et conserve un comportement dégradé simple : le plan local et la saisie WGS84 restent utilisables indépendamment de l’arrivée des tuiles.

## Fonctions disponibles

- déplacement par glisser-déposer ;
- zoom par molette et boutons +/− ;
- ajout d’un point par clic ;
- affichage des points numérotés et de la ligne locale ;
- centrage et ajout par latitude/longitude WGS84 ;
- stockage local par cellule ;
- maximum de 50 points ;
- attribution obligatoire du fournisseur de tuiles.

## Garde-fous conservés

L’alternative ne contourne pas les exigences de sûreté. Elle ne lit pas de GNSS embarqué, ne calcule pas de trajectoire autonome, ne crée pas de zone d’action, ne transmet aucune coordonnée à un aéronef et ne génère aucun fichier de mission. Aucun contrôle matériel n’est ajouté.

Le texte de bas de vue indique aussi que les conditions du service de tuiles, la disponibilité et les contraintes réglementaires doivent être vérifiées avant tout usage externe. OpenStreetMap fournit ici un fond cartographique standard, pas une garantie d’imagerie satellite ni une autorisation d’exploitation aérienne.

## Choix de performance

Le composant charge seulement les tuiles visibles autour du centre et ne fait pas appel à une API de directions, à un géocodeur ou à un moteur de calcul de trajectoire. Il est donc plus simple et plus indépendant pour la préparation visuelle locale. Aucune mesure comparative de latence n’est revendiquée dans cette itération ; la performance réelle dépendra du réseau, du cache navigateur et du fournisseur de tuiles.

Pour un usage externe à volume important, il faudra utiliser un fournisseur de tuiles autorisé ou une instance dédiée, avec cache/proxy conforme aux conditions du fournisseur, plutôt que de solliciter directement un serveur public sans vérifier ses limites.
