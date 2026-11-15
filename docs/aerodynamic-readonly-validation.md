# Validation aérodynamique — inspection ciblée en lecture seule

**Date :** 14 novembre 2026, 00:33 EET. **Projet :** `/home/ubuntu/aeromind`. **Référence comparée :** `/home/ubuntu/aeromind-original/Aeromind.IA`.

Cette inspection rapide porte exclusivement sur le centre Aérodynamique, ses helpers de données et de rendu, leurs tests et la file de réservation WebGL partagée. Aucun fichier source n’a été modifié, aucune installation, commande Git ni navigation navigateur n’a été effectuée. Seul ce compte rendu a été créé. Le build, l’exécution des tests et la recette navigateur finale relèvent de la validation principale.

## Écarts confirmés à l’instant de lecture

### Moyen — changement d’unité incohérent depuis « Settings »

Dans `frontend/client/src/components/AerodynamicSimulationCenter.tsx`, le sélecteur « Unité de longueur » de la section `settings` appelle encore directement `setLengthUnit(event.target.value)` (ligne 929 au moment de lecture), tandis que le sélecteur de l’importer appelle `changeLengthUnit` (ligne 856), qui met à jour `asset.boundsM` et `asset.sourceUnits` (lignes 806–825).

**Conséquence :** après un import STL/OBJ, changer l’unité dans Settings modifie l’unité courante sans recalculer les dimensions enregistrées. De retour à l’importer, le sélecteur et les dimensions/provenance du modèle peuvent se contredire. La branche directe existe aussi dans l’original : il s’agit d’un défaut conservé, pas d’une nouvelle régression établie.

**Correction minimale :** raccorder également ce sélecteur à `changeLengthUnit`, puis vérifier le parcours import STL/OBJ → Settings → changement d’unité → retour importer. Le traitement spécifique des unités 3MF, déjà pris en charge par la correction principale, n’est pas remonté ici comme nouvel écart.

### Moyen — cleanup incomplet en cas d’échec d’initialisation intermédiaire

Dans le même composant, `cleanupRenderer` est d’abord défini uniquement comme `disposeAerodynamicRenderer(resource)` (ligne 399). `OrbitControls`, les helpers et le modèle de présentation sont ensuite créés et les refs sont affectées; le cleanup complet n’est installé qu’à la ligne 559, après l’application du preset et la création/observation du `ResizeObserver`.

**Conséquence :** une exception intermédiaire — par exemple dans `ResizeObserver.observe`, après la création des contrôles — atteint le catch des lignes 587–592 avec seulement le cleanup renderer. Le contexte et le créneau sont libérés, mais `controls.dispose()`, les ressources de présentation/helpers et la remise à zéro des refs ne sont pas exécutés par cette branche. Les refs peuvent donc encore viser des objets dont le renderer est déjà détruit.

**Correction minimale :** installer un cleanup progressif/null-safe avant les opérations susceptibles de lever, puis alimenter les ressources acquises au fur et à mesure; réutiliser exactement ce cleanup dans le catch et au démontage. Ajouter un test d’échec injecté après la création des contrôles, vérifiant libération du renderer/créneau, détachement des contrôles et remise à zéro des refs. Cette observation est statique : aucune panne de pilote réelle n’est prétendue reproduite.

## Contrôles validés dans le périmètre

- La comparaison récursive avec l’original ne révèle pas de changement de source applicative hors du centre Aérodynamique, de ses helpers/tests et de `PhysicalDroneModel.tsx`/son test de file. Les autres différences recensées sont les TODO, la documentation et les fichiers de travail/runtime. La géométrie de `PhysicalDroneModel` est inchangée : le diff concerne la réservation partagée.
- `canCreateWebGL2Context` vérifie la présence de l’API sans créer de canvas ni de contexte de sonde. La construction réelle ne demande que `webgl2`, essaie deux profils de contexte et transmet le contexte détenu au renderer Three.js. Aucun repli silencieux WebGL1/2D n’est introduit.
- La file partagée possède une libération idempotente, une annulation des waiters, une protection contre la récursion/réentrance et une restitution du créneau si le callback lève. Les tests présents couvrent notamment FIFO, callback immédiat/ différé en erreur, annulation et une longue file de libérations synchrones. Ils n’ont pas été exécutés par cette inspection.
- Le cleanup normal annule animation/timer, déconnecte le ResizeObserver, retire les listeners, libère les contrôles, matériaux et helpers, puis libère le renderer/contexte et le créneau. La perte/restauration de contexte dispose d’un message explicite et d’une reconstruction locale temporisée; le démontage empêche les reprises tardives.
- Le composant importe STL/OBJ/3MF et ne substitue aucun drone générique à une géométrie absente ou refusée. Les modes de présentation utilisent le maillage décodé sans modifier ses matériaux source; les modes avancés non implémentés restent désactivés/explicités.
- Les champs initiaux sont vides (`NaN`/chaînes vides), y compris lorsqu’une configuration cockpit est fournie. L’ignorance de cette configuration est volontaire et documentée, non remontée comme régression.
- Aucun appel aux anciens helpers de densité, performance, maillage estimé, création d’historique analytique ou rapport analytique n’est présent dans le composant. Les helpers historiques restent dans la bibliothèque mais aucun autre consommateur applicatif de ces exports n’a été trouvé par la recherche ciblée. La densité et les autres résultats sont désormais indisponibles dans l’UI.
- Les exports accessibles contiennent uniquement des entrées utilisateur documentaires; résultat, maillage et convergence sont `null`. Le manifeste ne prétend pas être un cas OpenFOAM exécutable.
- Le filtrage historique retire les marqueurs explicitement analytiques connus et conserve les autres éléments d’un tableau, y compris les enregistrements de provenance inconnue, sans les afficher/exporter comme résultats validés.
- La correction de quarantaine des scénarios hérités ambigus étant encore en cours pendant cette inspection, aucun constat périmé à ce sujet n’est émis. Sa validation finale doit porter sur l’état livré, pas sur cet instantané.
- Les 14 rubriques et les liens vers les centres paramétrique/mécanique restent présents. Aucun chemin de commande matérielle ou de calcul CFD fictif n’est ajouté.

## Conclusion

**Périmètre respecté; deux écarts moyens ciblés ci-dessus à traiter ou recontrôler sur l’état final.** Aucun constat critique confirmé dans cette inspection. Ce compte rendu ne certifie ni la compatibilité GPU multi-navigateurs, ni la Preview, ni l’absence globale de régression : ces preuves nécessitent les tests/build et la recette navigateur finale déjà attribués à la validation principale.

### Actualisation finale — 00:33:58 EET

La correction concurrente de quarantaine est désormais présente : `originalScenarios` est capturé avant migration, `quarantineLegacyUserScenarios` est appelé avant l’écrasement de la clé active, et un échec empêche cet écrasement. Les scénarios ambigus ne sont donc pas classés automatiquement synthétiques. Aucun écart relatif à l’ancienne branche de migration n’est retenu. Les deux observations sur Settings et le cleanup intermédiaire étaient encore présentes lors de la relecture finale à 00:33:53 EET; les numéros de lignes peuvent avoir changé avec cette correction.

## Intégration finale par l’agent principal — 14 novembre 2026

Les deux constats moyens ci-dessus ont été corrigés après cette inspection. Settings appelle le même `changeLengthUnit` que l’importer ; dimensions et provenance sont mises à jour, y compris pour le 3MF interprété selon l’unité déclarée. Le parseur fourni ne convertit pas automatiquement l’unité du document, qui reste à confirmer humainement.

Chaque ressource du viewport est enregistrée dès sa création dans `createAerodynamicCleanup`. Le nettoyage progressif est idempotent, en ordre inverse, isole les erreurs de destructeurs et termine par la libération GPU et la remise à zéro des références/du DOM. Le test d’interruption partielle vérifie qu’un destructeur défaillant ne bloque pas la finalisation. Les temporisations DOM sont typées `number`.

Le contrôle global TypeScript, les 508 tests frontend et le build de production ont ensuite réussi. La recette navigateur et le rapport de livraison consolidé fournissent les preuves d’exécution complémentaires.
