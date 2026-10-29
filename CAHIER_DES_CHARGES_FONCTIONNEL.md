# Cahier des charges — Levée des blocages fonctionnels AeroMind / LABBENCH 01

## Contexte
L'utilisateur ne peut pas créer de projet sur AeroMind car l'authentification OIDC (Microsoft Entra ID) n'est pas configurée dans l'environnement de développement. L'authentification locale existe (`/api/auth/local/login`) mais exige mot de passe + TOTP, ce qui bloque l'accès. De plus, les boutons LABBENCH 01 ne sont pas tous opérationnels.

## Lot 1 — Connexion développement (débloquer la création de projet)

### Problème
Sans OIDC configuré, l'utilisateur ne peut pas s'authentifier → `auth.me` retourne `null` → `authenticatedUser` est `null` → `createProject()` affiche "Connectez-vous avant de créer un projet" → la création est bloquée.

### Solution
Ajouter un endpoint `/api/auth/dev-login` (uniquement en mode développement) qui :
1. Crée ou réutilise un compte utilisateur de test dans `admin_accounts`
2. Signe un jeton de session avec le secret configuré
3. Retourne le jeton pour stockage côté client

Le frontend Home.tsx doit :
1. Afficher un bouton "Connexion développement" quand OIDC n'est pas configuré
2. Appeler `/api/auth/dev-login` au clic
3. Stocker le jeton et rafraîchir l'état d'authentification

### Critères d'acceptation
- Un utilisateur peut se connecter en mode développement sans OIDC
- Après connexion, `auth.me` retourne l'utilisateur (non-null)
- La création de projet fonctionne (POST `/api/trpc/projects.create` → 200 + projet persisté)
- Le bouton "Créer un projet" est visible et cliquable après connexion

## Lot 2 — Boutons LABBENCH 01 opérationnels

### Problème
Plusieurs boutons LABBENCH 01 ne fonctionnent pas car :
1. Les endpoints API ne sont pas appelés correctement
2. Les sessions step-up ne sont pas établies
3. Les données de drone/révision ne sont pas chargées

### Solution
1. Vérifier que tous les endpoints `/api/lab/*` sont enregistrés et accessibles
2. Ajouter un bouton "Activer LABBENCH" qui émet une session step-up de développement
3. Rendre les boutons de sélection de drone, d'essai et d'historique fonctionnels
4. Afficher un état vide informatif quand aucune configuration n'est sélectionnée

### Critères d'acceptation
- Le bouton "Activer LABBENCH" émet une session step-up
- Les boutons de sélection de drone sont cliquables après step-up
- Le bouton "Lancer un essai" est désactivé sans configuration valide
- L'historique affiche les essais persistés

## Lot 3 — Interface et expérience utilisateur

### Problème
L'interface est complexe et certains boutons ne sont pas visibles ou accessibles.

### Solution
1. Ajouter des états vides informatifs ("Aucun projet", "Aucun drone sélectionné")
2. Désactiver (griser) les boutons qui nécessitent une étape préalable
3. Ajouter des messages d'aide contextuels

## Sécurité
- `HARDWARE_CONTROL` reste `false` par défaut
- Le endpoint dev-login n'est disponible qu'en mode développement
- Aucune commande physique n'est activée
- Les sessions step-up ont une TTL limitée
