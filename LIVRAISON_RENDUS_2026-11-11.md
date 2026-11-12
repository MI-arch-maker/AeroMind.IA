# Livraison — presets de rendu des visualiseurs AeroMind

## Modifications
Le viewport mécanique partagé affiche un sélecteur avec les dix styles demandés, appliqué au mesh du drone choisi. Il est disponible dans les surfaces qui montent `MechanicalTwinViewport`, notamment Centre Parametric, Centre Mécanique, Studio IDDS, Digital Twin Explorer, Virtual Parametric Factory et preview mécanique Admin/Super-Admin. Le Centre aérodynamique a reçu un sélecteur analogue pour son maillage importé et décodé. L’option Immersif permet d’ouvrir le viewport mécanique en plein écran.

Les styles sont des préréglages visuels CSS sur le rendu existant. Axonométrique et orthographique ne changent pas réellement le type de projection caméra. « ArchViz » et « Intérieur/Extérieur » n’apportent pas matériaux photométriques ni environnement d’intérieur; 360°/VR n’apporte pas de stéréoscopie de casque ou de contrôleur VR. Ce n’est pas une conversion en rendu CAO/ArchViz de production, ni un solveur CFD/FEA. La vue aérodynamique reste celle du mesh utilisateur importé/décodé et ne crée pas une géométrie si rien n’est chargé.

L’état des styles demeure local au viewport. Aucun projet n’est sauvegardé par le sélecteur. Il ne change pas les autorisations des comptes L1–L5 et ne contourne pas les mécanismes serveur. Les consoles administratives continuent leurs aperçus en lecture seule selon les droits déjà présents. Le verrouillage du contrôle physique de Factory est conservé.

## Validation exécutée
- `pnpm run check` : catalogues synchronisés (2 617 clés), TypeScript sans erreur.
- `pnpm run build` : compilation statique réussie. Avertissement préexistant de chunks JS volumineux (>1,5 Mo).
- Vitest ciblé : 4 fichiers, 21 tests réussis.
- Prévisualisation Vite : service lancé; vérifier l’URL ci-jointe dans le message de livraison.

## Non réalisé
Aucun déploiement de production, aucun compte L1–L5 dédié, aucun E2E authentifié et aucune qualification photoréaliste/VR ou de projection caméra n’ont été exécutés. Archive basée sur les sources présentes dans l’archive fournie; aucun historique Git de la source originale n’était présent dans l’archive à cette exécution.

## Extension des rendus mécaniques avancés
Le sélecteur du viewport du drone a été étendu par Écorché (explosion de pièces + transparence/coupe), Squelette Bionique (matériau treillis filaire), Carbone & Composites (matière sombre métallisée), Cyberpunk (métal sombre avec émission lumineuse), Clear Tech (transparence du mesh) et Flux Énergétique. Ces styles sont reliés au mesh affiché, non de simples écrans statiques.

Ces styles ne sont pas un solveur de generative design ni FEA, une simulation de couches de stratifié carbone, une métrologie optique ou une certification. Le menu principal « Style de rendu » est élargi avec les modes avancés et synchronisé avec le viewport; les trois modes historiques restent disponibles. Le visualiseur aérodynamique des maillages importés a également les choix avancés compatibles avec ce canvas.

## Trois rendus supplémentaires
Le menu principal comprend maintenant une carte CFD visuelle, une carte MEF visuelle, un maillage filaire sur fond bleu et une CAO transparente de type Blueprint. Les cartes affichent un gradient calculé à partir de la position des sommets et leur légende indique explicitement « démonstration, pas un résultat solveur ». Ce ne sont donc pas des sorties de simulateurs de fluides ou d’éléments finis. Wireframe expose les facettes triangulaires du mesh disponible; le blueprint ne peut révéler des composants absents de cette géométrie.


## Architecture de moteurs — évolution à 18:23
L’UI transmet son preset au registre central `frontend/client/src/lib/renderEngines.ts`; chaque option est résolue vers un pipeline déclaré et observable via `data-render-pipeline`. Le viewport applique les calculs au maillage actif. Correction de précision par rapport à la note précédente : la carte CFD n’est plus un simple gradient de coordonnées; c’est une estimation de pression par face orientée calculée d’après les normales de triangles, `Cp` approché et la pression dynamique q = ½ρV². La carte MEF est un indice de flexion de poutre proxy basé sur la portée et un facteur de peau. Ces deux champs calculés sont rendus avec des attributs de couleur par sommet. Les tests des moteurs couvrent valeurs, registry et géométries invalides/vide.

Ces algorithmes sont des **démonstrations géométriques**, non des solveurs Navier–Stokes ou éléments finis. Ils ne doivent servir ni à la conception structurelle, ni à la sécurité, ni à la décision de vol. Le registre catégorise les autres modes comme présentation ou proxy; il ne constitue pas l’implémentation d’un solveur génératif/topologique, d’un noyau CAO/CSG, d’un shader carbone anisotrope, du depth peeling/réfraction ou d’un moteur ArchViz path-tracing. L’intégration de ces moteurs professionnels reste à faire et est listée comme non réalisée dans TODO.

Le champ CFD de démonstration dispose maintenant d’un paramètre V∞ réglable (0–80 m/s, 20 m/s par défaut); la variation du champ avec la vitesse est testée. `pnpm run check` passe; tests ciblés: 25 réussis. L’audit qualité indépendant est en cours pendant le build final.


## Correction issue de l’audit technique
L’audit en lecture seule a relevé le repère AeroMind (X = envergure, Y = vertical, Z = axe longitudinal). Le calcul CFD proxy a donc été corrigé pour utiliser +Z comme direction d’écoulement, au lieu de l’axe X. Un test vérifie que la pression calculée diffère comme prévu entre surface orientée face au flux longitudinal et surface tournée latéralement. Le proxy reste explicitement non visqueux et non qualifié.
