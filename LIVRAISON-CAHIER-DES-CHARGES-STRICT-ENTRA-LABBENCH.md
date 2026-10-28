# Livraison stricte — Microsoft Entra et LABBENCH serveur uniquement

## Changements réalisés

1. LABBENCH ne rend plus ses vues opérationnelles lorsqu’il manque l’identité AeroMind ou un projet serveur réel.
2. Aucun état local/synthétique de remplacement n’est affiché dans ce cas : pas de gate locale, pas de run local, pas de télémétrie locale, pas de commande locale et pas de simulation de secours.
3. L’utilisateur voit un verrou explicite `LABBENCH verrouillé — données serveur requises` avec retour vers AeroMind.
4. Les projets utilisés par LABBENCH restent issus de `projects.list` côté serveur ; le workspace local ne sélectionne plus de projet qui ne provient pas du serveur.
5. La connexion Microsoft Entra reste le point d’entrée partagé dans AeroMind, LABBENCH et la console Super-Admin.
6. Les parcours locaux MFA et le Step-up LABBENCH ne sont pas supprimés.

## Validation automatisée

- `pnpm run check` : OK.
- `pnpm run build` : OK.
- Tests LABBENCH, régressions fonctionnelles et registre admin : OK.
- Compilation Python backend : OK.
- Contrat strict `serverDataReady` : OK.
- `/api/ready` : HTTP 200.
- `/labbench` : HTTP 200.
- Bundle frontend : marqueur de verrou serveur présent.

## Limite d’activation Entra

Le sandbox ne contient aucun secret Microsoft Entra. L’activation réelle de l’adresse `mcgregoralvin14@gmail.com` ne peut donc pas être simulée ou affirmée depuis cet environnement.

À fournir dans l’environnement de déploiement :

```env
ENTRA_TENANT_ID=<tenant>
ENTRA_CLIENT_ID=<client-id>
ENTRA_CLIENT_SECRET=<secret serveur>
ENTRA_REDIRECT_URI=https://<domaine>/api/auth/oidc/callback
```

Après redémarrage, `/api/auth/oidc/status` doit renvoyer `configured: true` et une recette interactive Entra doit être exécutée avec le compte autorisé.

## Définition de fonctionnement

La promesse « 100 % » est appliquée au comportement de verrouillage et au build testé : aucune donnée de remplacement n’est montrée quand le serveur manque. La connexion Entra réelle et la recette interactive avec le tenant ne peuvent être validées qu’après injection des secrets et authentification dans l’environnement cible.
