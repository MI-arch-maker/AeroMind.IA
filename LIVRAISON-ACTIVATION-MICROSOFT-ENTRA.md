# Livraison — Activation Microsoft Entra

## Changements

- Bouton Entra actif dans le cockpit AeroMind.
- Bouton Entra actif dans LABBENCH 01.
- Bouton Entra actif dans la console Super-Admin.
- Suppression du blocage visuel `disabled` lié uniquement au flag frontend runtime.
- Les trois boutons appellent directement `/api/auth/oidc/login`.
- Les parcours locaux mot de passe + TOTP et développement restent disponibles.
- Le backend reste l’autorité : les secrets Entra ne sont jamais exposés au frontend.
- Les variables acceptées par le backend sont `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`, ou le groupe `OIDC_*` équivalent.

## Validation

- Contrat statique des trois points d’entrée : OK.
- `pnpm run check` : OK.
- `pnpm run build` : OK.
- Compilation Python `web/config.py`, `web/oidc.py`, `web/app.py` : OK.

Sur Render, l’URL `ENTRA_REDIRECT_URI` doit correspondre exactement à :
`https://<domaine-render>/api/auth/oidc/callback`
