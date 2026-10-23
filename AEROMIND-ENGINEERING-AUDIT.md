# AeroMind — audit d’interface et organisation livrée

Date : 15 octobre 2026

## Diagnostic rapide

Le projet possède un moteur métier et des écrans riches, mais la navigation exposait **16 interfaces au même niveau**. Les intitulés mélangeaient français, anglais et identifiants internes, ce qui rendait le parcours d’ingénierie difficile à lire et augmentait le risque d’ouvrir un écran opérationnel avant d’avoir défini les exigences et la cellule.

## Organisation appliquée

La barre latérale principale suit désormais exactement l’arborescence validée :

1. **Vue générale**
2. **Mission & exigences**
3. **Bibliothèque de cellules**
4. **Studio IDDS**
5. **Construction & équipements**
6. **Observation & instrumentation**
7. **Simulation & analyses**
8. **LabBench 01**
9. **Poste de commande de vol**
10. **Essais & scénarios**
11. **Rapports & revue**
12. **Commandes sûres & gouvernance**

Les écrans techniques complémentaires restent accessibles via **Ouvrir les consoles avancées** : atelier de géométrie détaillée, inspection technique détaillée, copilote IA / jumeau numérique et journal de validation détaillé.

## Garde-fous conservés

- Le mode par défaut reste la simulation ; aucune sortie matérielle n’est activée.
- Les écrans, états partagés, modèles et tests métier existants sont conservés.
- Le manifeste de routes a été synchronisé avec les routes réellement déclarées (`/`, `/labbench`, `/admin`, `/super-admin`, `/404`).
- Les libellés de navigation ont été normalisés en français technique court.

## Vérifications

- `pnpm run check` — OK
- `pnpm test -- --run` — OK, **139 tests / 28 fichiers**
- `pnpm run build:static` — OK

## Limite connue

Le bundle principal reste volumineux car plusieurs ateliers avancés et leurs dépendances sont chargés dans le même point d’entrée. La prochaine amélioration d’architecture serait un découpage par `import()` dynamique des consoles avancées ; elle n’a pas été introduite dans cette passe rapide afin de limiter le risque fonctionnel.

## Règle de conformité IDDS / bibliothèque

La vue **IDDS · Conception 3D / Architecture** n’impose plus une géométrie par défaut. Une cellule sélectionnée depuis la bibliothèque devient la source canonique du rendu mécanique :

- multirotor : fuselage central, bras et rotors correspondants ;
- voilure fixe : fuselage, ailes, propulsion et empennage ;
- VTOL : fuselage, ailes, rotors de sustentation et propulsion arrière ;
- profils spécialisés : rendu rattaché à leur famille d’architecture ;
- dessin personnalisé : uniquement les géométries produites par l’utilisateur ;
- aucune sélection : canvas vide et aucune cote injectée.

Les pièces d’édition restent synchronisées avec la nomenclature, mais ne remplacent pas la silhouette canonique de la cellule sélectionnée.
