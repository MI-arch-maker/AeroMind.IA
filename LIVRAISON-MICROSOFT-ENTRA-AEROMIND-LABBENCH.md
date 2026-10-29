# Livraison — Microsoft Entra ID sur AeroMind, LABBENCH et Console Admin

## Parcours Entra commun

Le fournisseur Microsoft Entra ID est exposé par le flux OIDC serveur existant :

- `/api/auth/oidc/login` : démarrage Authorization Code + PKCE.
- `/api/auth/oidc/callback` : validation state, nonce, PKCE, signature, audience, issuer et identité.
- `/api/auth/oidc/me` : session et rôle AeroMind.
- `/api/auth/oidc/status` : statut public du fournisseur.
- `/api/platform/config.js` : indicateur public `externalOidcEnabled` et nom du fournisseur.

L’identité `mcgregoralvin14@gmail.com` reste déterminée par le registre AeroMind et la liste Super-Admin existante ; le fournisseur Entra ne contourne pas les contrôles d’autorisation.

## Interfaces mises en cohérence

- **AeroMind / Home** : bouton `Se connecter via Entra` conservé.
- **LABBENCH 01** : bouton `Se connecter via Microsoft Entra ID` ajouté dans le panneau d’identité AeroMind ; il coexiste avec le Step-up TOTP LABBENCH.
- **Console Admin / Super-Admin** : bouton `Continuer avec Microsoft Entra` conservé ; le parcours local mot de passe + TOTP et l’enrôlement local restent disponibles.
- **Développement** : le parcours dev-login existant n’est pas supprimé.

Si le fournisseur n’est pas configuré dans l’environnement courant, LABBENCH affiche `Microsoft Entra non configuré` au lieu d’échouer silencieusement ; les parcours locaux restent accessibles.

## Configuration de déploiement

Variables déjà prévues par le projet :

```env
ENTRA_TENANT_ID=<tenant Microsoft Entra>
ENTRA_CLIENT_ID=<application client ID>
ENTRA_CLIENT_SECRET=<secret côté serveur>
ENTRA_REDIRECT_URI=https://<domaine>/api/auth/oidc/callback
```

L’URL de callback doit être déclarée à l’identique dans l’enregistrement d’application Microsoft Entra. Les secrets restent côté serveur et ne sont jamais exposés dans `platform/config.js`.

## Validation

- `pnpm run check` : OK.
- `pnpm run build` : OK.
- Tests admin / registre / LABBENCH : OK.
- Syntaxe `web/config.py`, `web/oidc.py`, `web/app.py` : OK.
- Contrat des trois surfaces Entra + options locales : OK.
- `/api/ready` : HTTP 200.
- `/labbench` : HTTP 200.
