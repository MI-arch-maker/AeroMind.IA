# Audit & corrections — AeroMind Mechanical Twin / Studio IDDS

**Date : 16 octobre 2026**  
**Projet :** `AeroMind-Mechanical-Twin-Final-DroneBound`

## Conclusion de l’audit

Le constat était **partiellement juste** : plusieurs commandes de Mechanics Twin étaient des commandes vitrines, tandis que le Studio IDDS possédait déjà un véritable canevas paramétrique, des outils de dessin/calques, des propriétés de pièces et des exports. En revanche, le libellé de sa revue et l’annonce « 3D » excédaient ce que les contrôles et la vue centrale faisaient réellement.

La prévisualisation exécutée n’avait **aucun projet ni aéronef actif**. Les écrans Digital Twin et IDDS présentent donc une demande explicite de source et bloquent les calculs tant qu’une architecture n’est pas sélectionnée : ce garde-fou est correct, pas une fausse commande. Les opérations éditées ci-dessous s’exécutent sur la source que l’utilisateur choisit, et les fonctions locales restent locales.

## Corrections livrées

### Mechanics Twin

- **Simulation** : branchement au moteur local `runSimulation` d’AeroMind; affichage de masse, puissance, endurance et portée avec identifiant de calcul et avertissement « estimation indicative, ni CFD/FEA ni commande matérielle ».
- **Analyse** : contrôle effectif des sommets, indices de triangles, triangles dégénérés et pièces masquées/visibles; résultats affichés dans un rapport.
- **Symétrie** : création d’une **copie miroir de maillage** au plan X=0, inversion correcte de l’ordre des faces, persistance dans la configuration et export OBJ. Une pièce déjà centrée est signalée au lieu de produire une copie superposée.
- **Congé** : pour les modules cubiques personnalisés, génération d’une vraie boîte arrondie par géométrie 3D. Pour les autres formes, l’interface indique pourquoi l’opération n’a pas été appliquée (pas de faux succès).
- **Révisions** : remplacement de six jalons statiques par des instantanés locaux réellement enregistrés, comparables et restaurables (jusqu’à 30 par cellule).
- **Séquence d’assemblage** : chaque étape sélectionne une pièce visible correspondante et ouvre le dock d’assemblage.
- **Navigation et exports** : les vues Simulation, Analyse, Fabrication, Données et Collaboration ont une action réelle; Fabrication exporte l’OBJ, Données exporte le JSON et Collaboration copie/télécharge un JSON partageable. Aucun service distant de collaboration n’est prétendu.
- **Esquisse** : le bouton oriente explicitement vers le dessin 2D du Studio IDDS plutôt que de simuler un mode esquisse 3D.

### Studio IDDS

- La revue précédente se contentait de constater que les calques étaient couverts. Elle effectue maintenant un audit local des affectations de calques, masses absentes/non positives, interfaces non documentées, références fabricant non vérifiées et calques vides.
- Les libellés « modélisation 3D », « conception 3D » et « vue 3D isométrique » ont été remplacés par **géométrie paramétrique / projection 2D de dessus**, conformément à ce que la vue principale rend réellement.
- Le bouton de revue a été renommé **Auditer la construction** et son contrôle est décrit sans prétention de certification.

## Fichiers source principaux

- `frontend/client/src/components/MechanicalTwinEditor.tsx`
- `frontend/client/src/lib/mechanicalTwinGeometry.ts`
- `frontend/client/src/lib/mechanicalTwinReview.ts` *(nouveau)*
- `frontend/client/src/lib/mechanicalTwinReview.test.ts` *(nouveau)*
- `frontend/client/src/components/mechanical-twin.css`
- `frontend/client/src/components/DesignStudioView.tsx`

## Validation

- `pnpm check` : **réussi** (catalogues synchronisés et TypeScript sans erreur).
- `pnpm test` : **réussi — 41 fichiers, 194 tests**.
- `pnpm build:static` : **réussi**. Vite signale un gros chunk JavaScript (avertissement de performance, non bloquant).
- Prévisualisation navigateur : l’application et le Studio IDDS se chargent; le workspace de prévisualisation est vide et exige une sélection explicite de cellule.

## Limites explicites

- Les calculs AeroMind existants sont des estimations de performance. Ils ne remplacent pas CFD, FEA, un solveur de contraintes, un essai en vol, une qualification ou une revue de sécurité.
- La symétrie produit une géométrie miroir indépendante de la pièce source; les modifications globales ultérieures de celle-ci ne recalculent pas automatiquement la copie.
- Le congé géométrique est supporté sur un module cubique personnalisé, pas sur les maillages/profils arbitraires.
- L’export OBJ/JSON est local; aucun export STEP ni service de collaboration distant n’est ajouté.
- Ces changements n’activent aucun contrôle matériel ni aucune sortie de vol.
