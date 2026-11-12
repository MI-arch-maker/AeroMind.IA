# Livraison — suppression effective des projets

## Modifications

- La suppression d’un projet par son propriétaire est désormais autorisée dès le niveau L1. Le backend continue de vérifier l’identité et la propriété du projet avant d’effacer quoi que ce soit.
- Dans la console Super-Admin, le bouton « Supprimer » appelle directement la mutation de suppression après une confirmation explicite. Il n’est plus conditionné par le téléchargement préalable d’une archive de restauration.
- Avant chaque effacement, le backend conserve un instantané du projet et de ses drones dans l’archive protégée Super-Admin, avec identité du projet/propriétaire, motif, horodatage et empreinte SHA-256. Les éléments dépendants sont ensuite effacés avec le projet.
- L’export JSON de restauration reste disponible séparément et facultatif. L’archive de trace Super-Admin n’est pas un bouton de restauration automatique.

## Contrôles effectués

- Compilation frontend Vite : réussie.
- Vérification TypeScript et catalogue i18n : réussie.
- Tests Vitest : 87 fichiers, 421 tests réussis.
- Tests Python ciblés de politique d’accès et workspace : 21 tests réussis.
- Vérification de syntaxe Python des modules modifiés : réussie.
- Prévisualisation serveur : HTTP 200, endpoint santé HTTP 200.

La compilation signale des bundles JavaScript volumineux (avertissement Vite préexistant, sans échec). Le build généré et les dépendances installées ne sont pas inclus dans l’archive source; ils sont reproductibles avec les scripts et lockfiles du dépôt.
