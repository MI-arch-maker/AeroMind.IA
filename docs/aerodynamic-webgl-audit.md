# Audit WebGL partagé et viewport aérodynamique

**Date : 14 novembre 2026. Périmètre : audit local rapide, sans installation, recherche externe ni Git.** Projet `/home/ubuntu/aeromind`; archive de référence vérifiée : `/home/ubuntu/aeromind-original/Aeromind.IA`.

## Modifications effectuées

Seule la zone du gestionnaire partagé dans `frontend/client/src/components/PhysicalDroneModel.tsx` (anciennement lignes 24–68), son fichier `PhysicalDroneModel.webgl.test.ts` et ce rapport ont été modifiés par cet audit. Aucun changement au viewport, aux helpers du parent, aux autres consommateurs ou à la partie données.

Le budget reste **un créneau**. `canCreateWebGL2Context()` reste un test de présence de l’API, sans création de canvas, sans `getContext()` et sans perte de contexte de sonde. Ce n’est volontairement pas une garantie d’allocation GPU : le renderer réel doit encore gérer les refus du navigateur.

Deux défauts concrets sont corrigés :

- Un `onGranted` levant une exception ne conserve plus le créneau. Le gestionnaire restitue sa réservation avant de propager l’exception immédiate d’origine.
- Une exception dans un callback en attente ne remonte plus dans le cleanup du détenteur précédent et ne bloque plus les suivants. Elle est signalée par `console.warn`, puis la file continue.

Le drainage est désormais itératif et protégé contre la réentrance. Une nouvelle demande créée pendant le drainage rejoint la fin de la file, même si un callback vient de libérer son créneau. Annulation et libération restent idempotentes. Aucun délai, préemption, élargissement du budget ou changement de signature n’a été introduit.

**Limite fondamentale :** restituer la réservation n’arrête pas un renderer. Le callback consommateur doit libérer ses ressources avant de lever une exception ou d’appeler sa libération. Le gestionnaire ne possède ni canvas ni contexte et ne peut pas le faire à sa place.

## Validation

Commande exécutée depuis `frontend`, avec les dépendances déjà disponibles :

```sh
./node_modules/.bin/vitest run \
  client/src/components/PhysicalDroneModel.webgl.test.ts \
  client/src/components/AerodynamicSimulationCenter.test.ts \
  client/src/lib/aerodynamicWebGL.test.ts \
  --pool=forks --maxWorkers=1 --minWorkers=1
```

**Résultat : 3 fichiers, 25 tests réussis.** Dont 12 tests du gestionnaire/capacité, 8 tests préexistants du modèle et des projections aérodynamiques, 5 tests du nouveau helper du parent.

Les tests ajoutés couvrent : absence de sonde et SSR, attribution immédiate avec budget de un, FIFO, annulation répétée d’un waiter, idempotence après transfert, exceptions immédiates et différées, libération suivie d’exception, réservation réentrante, annulation depuis un autre callback, drainage de 10 000 callbacks libérant synchronement sans récursion.

Le typecheck global `tsc --noEmit --incremental false` a été lancé puis arrêté pour respecter le périmètre rapide après plus d’une minute sans résultat; **aucune réussite TypeScript globale n’est revendiquée**. Aucun test navigateur/GPU réel n’a été effectué. Avertissement non bloquant de Three sur un import CJS émis par les dépendances pendant Vitest.

## Renderer Three et protections déjà ajoutées par le parent

Les sources installées de `three/src/renderers/WebGLRenderer.js`, méthode `dispose` (lignes 1086–1109 lors de la lecture), nettoient caches, listeners et ressources internes, mais **n’appellent pas la perte du contexte**. `renderer.dispose()` ne garantit donc pas à lui seul de rendre immédiatement le quota de contextes au navigateur; le GC n’est pas un mécanisme de budget fiable.

Le parent a déjà ajouté `lib/aerodynamicWebGL.ts`, transmis le contexte WebGL2 réel au renderer, remplacé la sonde/réacquisition du chemin d’erreur, ajouté la perte explicite du contexte, corrigé les matériaux multiples des axes, attrapé les erreurs de rendu RAF et prévu un timer de récupération après 1 500 ms. L’effect restitue maintenant le créneau dans un `finally`. Ces changements ont été lus, pas modifiés ici.

Les sources locales de Fiber confirment également un teardown de ses renderers possédés avec `dispose()` puis `forceContextLoss()`, isolant leurs erreurs (`dist/events-21d8cd92.cjs.dev.js`, `disposeRenderer`, `unmountComponentAtNode`, autour des lignes 17306–17374). **Ne pas affirmer qu’un montage/démontage React et la restitution du créneau sont nécessairement atomiques :** Fiber dispose via son reconciler, et son code attend les initialisations en cours. Ce n’est pas le gestionnaire de créneau qui synchronise ce teardown.

## Recommandations restantes au parent — prioritaires et concrètes

### 1. Garantir la destruction GPU même si un cleanup antérieur lève

Dans `ModelViewport`, le cleanup final appelle successivement `controls.dispose()`, `disposeAeroDisplayModel()`, les géométries/matériaux, puis `disposeAerodynamicRenderer(resource)`. Si un appel avant le dernier lève, **le `finally` externe restitue le créneau mais la perte GPU est sautée** : le prochain renderer peut être créé pendant que l’ancien contexte reste vivant.

Entourer le nettoyage des ressources de scène d’un `try/finally` qui appelle impérativement `disposeAerodynamicRenderer(resource)`, puis nettoyer refs/DOM dans un second `finally`. Mieux : chaque étape susceptible de lever est isolée pour que listeners, observer, contrôles et toutes les ressources soient nettoyés indépendamment. Le créneau doit être rendu **après** cette tentative de destruction du contexte, jamais avant.

### 2. Rendre le teardown réellement idempotent et couvrir l’initialisation partielle

Le commentaire « Idempotent » de `disposeAerodynamicRenderer()` ne correspond pas encore à son implémentation : un second appel répète `renderer.dispose()`, `loseContext()` et `remove()`. Ajouter un marqueur par ressource (par exemple `WeakSet`, marqué avant les appels susceptibles de lever) et un test de double appel, y compris après un premier `dispose()` ayant levé.

Dans le viewport, prendre puis mettre à `null` `cleanupRenderer` avant de l’invoquer, afin qu’un échec d’initialisation déjà nettoyé ne provoque pas un nouveau teardown à l’unmount. Enregistrer les nettoyages **au moment de chaque acquisition** : actuellement, le cleanup complet n’est affecté qu’à la fin, tandis que celui de secours ne connaît que le renderer. Si `observer.observe()`, un preset ou l’installation des listeners échoue après création des contrôles, ces contrôles/listeners/refs peuvent rester référencés malgré la perte GPU. Une pile de cleanups inscrits à l’acquisition résout ce cas sans refonte fonctionnelle.

### 3. Fermer toutes les portes des callbacks tardifs

Retirer les listeners `webglcontextlost/restored` avant la perte volontaire : c’est maintenant le bon ordre sur le chemin nominal. Ajouter cependant `if (disposed || contextLost) return` au handler de perte après le `preventDefault`, et des gardes `disposed/contextLost` au callback du `ResizeObserver`. Une perte tardive provenant d’une instance abandonnée ne doit ni modifier l’UI ni démarrer un nouveau timer.

Garder le timer unique annulé au teardown et le contrôle `!disposed` avant retry. Si le code devient asynchrone, utiliser également un identifiant de génération capturé par chaque callback. Une exception RAF affiche maintenant une erreur et arrête la boucle, mais conserve le créneau jusqu’au retry/unmount : choisir explicitement entre cette pause volontaire et le teardown immédiat pour ne pas immobiliser les autres vues.

### 4. Ne pas monopoliser le budget pour une vue vide

Le viewport acquiert actuellement un contexte même sans `asset.object`, pour sa grille et ses axes. Avec un budget de un, deux `ModelViewport` simultanément montés ne peuvent pas tous deux être actifs; le deuxième attend normalement tant que le premier garde le créneau. Confirmer que les panneaux alternatifs sont démontés, ou réserver uniquement pour une géométrie décodée et une vue réellement visible. Ne pas relever le budget pour masquer cette attente.

### 5. Imports et propriété des ressources

L’import du gestionnaire commun `reserveWebGLCanvas` doit rester partagé, pas dupliqué dans le helper spécialisé. `createAerodynamicRenderer` est le bon lieu pour l’acquisition réelle; le test de présence d’API ne doit pas redevenir une sonde.

`createAeroDisplayModel` partage volontairement les géométries source sauf lorsqu’il fabrique une copie pour calculer des normales. Conserver cette discipline : le teardown du viewport ne doit pas disposer indistinctement les géométries/matériaux de `asset.object`. Le remplacement/refus/suppression d’un import peut nécessiter un nettoyage du propriétaire de l’asset, après arrêt de ses vues; ne pas introduire cette responsabilité dans le clone d’affichage. Les matériaux nouveaux des presets et les géométries locales de normales sont bien distingués.

Tests conseillés au parent : cleanup de contrôles levant mais perte GPU et restitution toujours exécutées; double teardown; échec après acquisition de l’observer; événement lost tardif après teardown; restored suivi du timer ancien ne déclenchant qu’un retry; erreur RAF; deux vues avec annulation de la vue en attente.

## Autres consommateurs inspectés — non modifiés

| Consommateur | Constat et action future précise |
| --- | --- |
| `PhysicalDroneModel` | Le hook réserve avec `nearViewport && webGLAvailable`, même si `design` est absent. Il ne tient pas compte non plus de `rendererFailed`; après un cycle hors/près du viewport, un renderer déjà définitivement en fallback peut récupérer un créneau sans créer de Canvas. Inclure l’existence de la sélection et l’état d’échec dans la condition d’acquisition, après confirmation du périmètre. Texture carbone et matériau construits dans `useMemo` méritent un cleanup explicite du propriétaire; les textures ne sont pas libérées simplement par `Material.dispose()`. |
| `MechanicalTwinViewport` | Budget commun et géométries/edges avec cleanup explicite. Risque de chevauchement concret : `rendererWebgl` est volontairement conservé pendant `pointerActive`, mais l’effect peut restituer immédiatement son créneau quand `visible/supported` change. Un ancien Canvas peut donc rester monté sans réservation. Conserver le créneau jusqu’au teardown effectif ou ne pas retarder la sortie WebGL; ne pas forcer un second contexte. L’observer initial suppose aussi `IntersectionObserver` disponible. |
| `PhotorealisticTerrain3D` | Réservation conditionnée à la visibilité et repli explicite. `failed` est déclaré mais le callback d’erreur ne le met pas à `true`; il ne fait que restituer le créneau. Clarifier le statut terminal et le retry volontaire, sans le transformer en boucle de recréation. Synchroniser restitution et teardown Fiber plutôt que de supposer la simultanéité. |
| `WireframeViewer` | Les échecs shader/program après `getContext('webgl2')` retournent `null` sans supprimer les ressources ni perdre le contexte. Le chemin `mustRemountCanvas` peut répéter les tentatives sur une erreur permanente. En outre, une vue rendue d’abord en 2D pendant l’attente reçoit ensuite le créneau sur le même canvas déjà lié au contexte 2D : `getContext('webgl2')` est refusé, et elle peut garder le budget en restant 2D. Remonter une fois un canvas neuf lors de l’octroi; en cas d’échec permanent nettoyer/perdre puis rendre la réservation et fixer un état d’échec sans retry automatique. L’observer arrête seulement le RAF hors écran, pas la réservation, qui reste prise jusqu’à l’unmount. |

## Sources des rendus et géométries artificielles

**Viewport aérodynamique :** les sources sont les données du fichier utilisateur, décodées localement par `STLLoader.parse`, `OBJLoader.parse`, `ThreeMFLoader.parse` dans `importModel`. Les formats non décodables restent `object: null`, avec état explicite `received-not-decoded`; aucun modèle de substitution n’est injecté. Le viewport clone l’objet décodé, cadre la vue, calcule éventuellement des normales locales et remplace des matériaux. Grille et axes sont des aides visuelles, pas une géométrie de drone ou un champ calculé.

L’explosion déplace uniquement des maillages distincts disponibles, n’invente pas de pièces physiques et est neutralisée pour un seul maillage. Un décalage déterministe est choisi lorsque plusieurs centres de pièces coïncident : c’est une convention de présentation déclarée, pas un résultat mécanique. Le preset lowpoly est un rendu facetté, pas une décimation. Les états indisponibles CFD/FEA/VR restent distingués des effets visuels. Les 8 tests existants vérifient notamment la préservation source, les normales locales, l’explosion, les maillages masqués/imbriqués et les projections réelles.

**Autres rendus :** `PhysicalDroneModel` est une maquette paramétrique construite avec primitives Three et configuration du catalogue; ses pièces ajoutées sont des boîtes illustratives. `WireframeViewer.buildWireGeometry` crée des profils génériques déterministes par catégorie, pas du CAD importé. Le terrain « photoréaliste » est procédural (`PlaneGeometry`, relief mathématique, arbres/bâtiments/neige avec `Math.random`), pas une donnée topographique ou une scène mesurée. `MechanicalTwinViewport` reconstruit ses buffers depuis `part.vertices`/indices via `transformedPartVertices`; il ne consomme pas directement l’asset importé du centre aérodynamique. Ne pas présenter ces sources comme interchangeables ou comme validations physiques.

## Conclusion

Le gestionnaire partagé ne fuit plus son budget sur exception et ne bloque plus sa file dans les cas couverts, tout en conservant le budget de un. La priorité restante est l’atomicité logique **teardown GPU → restitution → prochain renderer**, en particulier lorsqu’un cleanup intermédiaire lève. Les protections du parent améliorent déjà nettement le viewport; les points ci-dessus sont ciblés et ne justifient pas de changement large des autres composants dans cet audit.

## État final d’intégration — 14 novembre 2026

Les recommandations relatives au viewport Aérodynamique ont été intégrées : libération GPU garantie, idempotence par ressource, nettoyage progressif dès acquisition, erreurs de rendu explicites et récupération locale après perte du contexte. Les tests de cleanup et la recette navigateur d’initialisation interrompue démontrent la reprise sans créneau perdu. TypeScript, les 508 tests frontend et le build réussissent ; la recette Chromium ne signale aucune erreur JavaScript ou shader. Les observations sur les autres consommateurs sont hors du périmètre modifié et ne sont pas des régressions introduites par cette livraison. Le rapport consolidé précise la portée validée et les limites multi-navigateurs.
