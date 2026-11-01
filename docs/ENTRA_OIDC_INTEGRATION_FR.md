# Intégration Microsoft Entra ID — OIDC AeroMind

## Principe

Microsoft Entra ID authentifie l’identité via OpenID Connect. Il ne détermine pas les rôles AeroMind et ne remplace pas la gouvernance institutionnelle. Les rôles `gate_01_reviewer`, `gate_02_reviewer`, `gate_03_reviewer`, `gate_04_reviewer` et `super_admin` restent attribués, vérifiés et journalisés par AeroMind.

## Configuration

Déclarer dans le gestionnaire de secrets du déploiement :

```text
ENTRA_TENANT_ID=<GUID du tenant autorisé>
ENTRA_CLIENT_ID=<Application (client) ID>
ENTRA_CLIENT_SECRET=<secret client, jamais dans le dépôt>
ENTRA_REDIRECT_URI=https://<origine-publique>/api/auth/oidc/callback
```

L’autorité utilisée est construite sous la forme :

```text
https://login.microsoftonline.com/<ENTRA_TENANT_ID>/v2.0
```

Les autorités multi-tenant `common`, `organizations` et `consumers` sont refusées.

## Contrôles de jeton

Le callback serveur :

1. récupère la découverte OIDC et les JWKS ;
2. échange le code avec PKCE ;
3. vérifie cryptographiquement l’ID token avec la clé JWKS correspondante ;
4. impose l’algorithme `RS256` ;
5. vérifie `iss`, `aud`, `exp`, `iat`, `sub`, `nonce` et, lorsqu’il est présent, `azp` ;
6. exige que `tid` corresponde exactement au tenant configuré ;
7. refuse une identité qui ne correspond pas à un compte Aeromind actif ou en évaluation.

## Association au compte Aeromind

Le compte doit être préprovisionné dans l’allowlist Aeromind. Lors de la première connexion OIDC validée, AeroMind lie durablement `entraTenantId` et `entraSubject` au compte, puis refuse toute connexion ultérieure avec un autre couple tenant/sujet pour la même adresse. Cette liaison ne modifie ni le rôle ni le niveau du compte.

## Sessions et réauthentification

Les sessions AeroMind sont créées côté serveur après validation du jeton, signées par le secret de session, limitées à huit heures et enregistrées dans l’allowlist de sessions pour permettre la révocation au logout. Le cookie est HttpOnly ; en prévisualisation HTTPS embarquée, il doit être configuré `Secure`/`SameSite=None` par le runtime public.

Pour forcer une réauthentification Entra :

```text
GET /api/auth/oidc/login?reauth=true&return_to=/super-admin
```

Le flux transmet `prompt=login` et `max_age=0`. Le callback conserve la vérification de state, nonce, PKCE, tenant et compte Aeromind.

## Limites institutionnelles

Une authentification Entra réussie ne valide aucun GATE. Elle ne génère pas de code de transmission, ne remplace pas le Super-Administrateur et ne crée aucune autorisation de sortie physique. Les décisions GATE 01 à GATE 05 demeurent contrôlées par les permissions et le journal institutionnel AeroMind.
