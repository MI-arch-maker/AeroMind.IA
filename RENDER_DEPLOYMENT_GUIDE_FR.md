# AeroMind — configuration Render complète

Ce guide correspond au projet livré : service Docker FastAPI qui sert aussi le frontend Vite compilé, PostgreSQL Render, authentification OIDC/Entra optionnelle, fournisseur OpenAI optionnel et observateur MAVLink strictement lecture seule.

## 1. Déploiement recommandé

Le dépôt contient déjà `render.yaml`. Dans Render :

1. Pousser le dossier `aeromind` dans un dépôt GitHub/GitLab.
2. Dans Render, choisir **New → Blueprint** et sélectionner le dépôt.
3. Vérifier la région `frankfurt` pour le service web et PostgreSQL. Le service et sa base doivent être dans la même région pour utiliser l’URL interne PostgreSQL. [1]
4. Appliquer le Blueprint.
5. Compléter les variables `sync: false` dans **Environment**.
6. Enregistrer le domaine Render obtenu, par exemple `https://aeromind-ai.onrender.com`.
7. Remplacer la valeur d’origine CORS et le redirect URI OIDC par ce domaine exact.
8. Lancer un nouveau déploiement.

Le Dockerfile compile le frontend, installe les dépendances Python puis démarre :

```text
uvicorn web.app:app --host 0.0.0.0 --port ${PORT:-10000}
```

Le port public attendu est `10000` par défaut chez Render. Le health check est `/api/ready`. [2]

## 2. Variables obligatoires

À définir sur le service web Render :

```dotenv
AEROMIND_ENV=production
PORT=10000
AEROMIND_SESSION_SECRET=<secret aléatoire d’au moins 32 octets>
DATABASE_URL=<fourni automatiquement par Render Postgres>
AEROMIND_ALLOWED_HOSTS=<hôte Render et domaine personnalisé>
AEROMIND_ALLOWED_ORIGINS=<origine HTTPS exacte du frontend>
HARDWARE_CONTROL=false
```

Le Blueprint génère automatiquement `AEROMIND_SESSION_SECRET`. Ne pas réutiliser une valeur de développement. `DATABASE_URL` est injectée depuis la base `aeromind-db`; l’URL interne est préférable pour un service Render situé dans la même région. [1]

Exemple après création du service :

```dotenv
AEROMIND_ALLOWED_HOSTS=aeromind-ai.onrender.com,app.example.com,*.onrender.com
AEROMIND_ALLOWED_ORIGINS=https://aeromind-ai.onrender.com
```

Si un domaine personnalisé est utilisé :

```dotenv
AEROMIND_ALLOWED_HOSTS=aeromind-ai.onrender.com,app.example.com,*.onrender.com
AEROMIND_ALLOWED_ORIGINS=https://app.example.com
```

`AEROMIND_ALLOWED_ORIGINS` doit contenir l’origine complète avec `https://`, sans chemin final. Plusieurs origines sont séparées par des virgules.

## 3. Variables d’identité et d’administration

```dotenv
AEROMIND_SUPERADMIN_EMAILS=admin@example.com
AEROMIND_TRIAL_EMAILS=demo@example.com
```

`AEROMIND_SUPERADMIN_EMAILS` contient une ou plusieurs adresses OIDC séparées par des virgules. Aucun mot de passe local n’est créé. `AEROMIND_TRIAL_EMAILS` ne contourne pas la validation OIDC; il détermine seulement les identités autorisées pour le parcours d’essai.

Pour désigner le premier administrateur, enregistrer l’adresse dans le fournisseur OIDC, puis la placer dans `AEROMIND_SUPERADMIN_EMAILS`. Le script local `python -m web.create_admin --email admin@example.com` ne crée pas de compte distant : il sert uniquement à valider le flux applicatif local.

## 4. Authentification — choisir un seul bloc

### Option A — Microsoft Entra ID

Définir les quatre variables suivantes et laisser le bloc OIDC générique vide :

```dotenv
ENTRA_TENANT_ID=<tenant ID ou domaine du tenant>
ENTRA_CLIENT_ID=<application client ID>
ENTRA_CLIENT_SECRET=<secret client Entra>
ENTRA_REDIRECT_URI=https://aeromind-ai.onrender.com/api/auth/oidc/callback
```

Dans Entra, déclarer exactement le même redirect URI en **Web / Redirect URIs**. Pour un domaine personnalisé, remplacer l’hôte par le domaine personnalisé.

### Option B — OIDC générique

Définir les quatre variables suivantes et laisser le bloc Entra vide :

```dotenv
OIDC_ISSUER=https://issuer.example.com
OIDC_CLIENT_ID=<client ID>
OIDC_CLIENT_SECRET=<secret client>
OIDC_REDIRECT_URI=https://aeromind-ai.onrender.com/api/auth/oidc/callback
```

L’issuer doit être l’URL HTTPS de l’autorité OIDC. Le projet utilise la découverte OIDC à partir de cet issuer et vérifie l’identité, l’audience et l’émetteur du jeton.

## 5. OpenAI — facultatif

Le mode règles locales reste disponible sans clé OpenAI. Pour activer le fournisseur OpenAI-compatible :

```dotenv
OPENAI_API_KEY=<clé secrète>
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-5-mini
```

Pour un proxy compatible OpenAI, remplacer `OPENAI_API_BASE` par son URL HTTPS et choisir le modèle disponible dans `OPENAI_MODEL`. Ne jamais exposer `OPENAI_API_KEY` dans le frontend, le dépôt ou les logs.

## 6. Sécurité matériel, geofence et MAVLink

### Garde-fou obligatoire

```dotenv
HARDWARE_CONTROL=false
```

Conserver cette valeur à `false` dans Render. Cette version n’active pas les sorties physiques, même si d’autres variables de compatibilité MAVLink sont présentes.

### Geofence

Optionnelle pour les contrôles déclaratifs et le SITL :

```dotenv
AEROMIND_GEOFENCE={"min_latitude":45.0,"max_latitude":46.0,"min_longitude":-74.0,"max_longitude":-73.0}
```

Utiliser un JSON valide sur une seule ligne. Ajuster les coordonnées à la zone de test réelle. Cette variable ne transforme pas l’application en système de contrôle autonome.

### Variables MAVLink

```dotenv
# Compatibilité du chemin MAVLink standard existant.
AEROMIND_MAVLINK_URL=udpin:gateway.internal:14550

# Chemin utilisé par l’écran et l’API d’observation read-only.
AEROMIND_MAVLINK_OBSERVER_URL=udpin:gateway.internal:14551
AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S=5
AEROMIND_MAVLINK_RECONNECT_INTERVAL_S=5
```

`AEROMIND_MAVLINK_URL` et `AEROMIND_MAVLINK_OBSERVER_URL` ne doivent être définis vers une adresse réelle que si un gateway MAVLink est effectivement accessible depuis Render.

Render expose le service web sur son port HTTP public et ne fournit pas un endpoint UDP public pour recevoir directement un flux MAVLink. Le service web peut utiliser des ports supplémentaires sur le réseau privé, mais le trafic public entrant est routé vers un seul port HTTP. [2] Il faut donc, pour un flux réel :

- un gateway MAVLink externe qui pousse vers une infrastructure réseau accessible par Render ; ou
- un service privé/gateway compatible dans le même environnement réseau ; ou
- une passerelle qui convertit le flux MAVLink en transport HTTPS/WSS sécurisé.

Sans gateway, ne pas renseigner une fausse URL MAVLink : l’écran restera correctement en statut `WAITING_HEARTBEAT`, `HEARTBEAT_STALE` ou `RECONNECTING` et aucune commande ne sera émise.

## 7. Récapitulatif des variables du projet

| Variable | Obligatoire | Valeur Render recommandée | Secret | Rôle |
|---|---:|---|---:|---|
| `AEROMIND_ENV` | Oui | `production` | Non | Profil runtime |
| `PORT` | Oui | `10000` | Non | Port HTTP Render |
| `DATABASE_URL` | Oui | Référence Postgres Render | Oui | Base applicative |
| `AEROMIND_SESSION_SECRET` | Oui | `generateValue: true` | Oui | Sessions et cookies |
| `AEROMIND_ALLOWED_HOSTS` | Oui | Hôtes exacts + `*.onrender.com` | Non | Protection Host |
| `AEROMIND_ALLOWED_ORIGINS` | Oui | Origine HTTPS exacte | Non | CORS |
| `HARDWARE_CONTROL` | Oui | `false` | Non | Verrou matériel |
| `AEROMIND_SUPERADMIN_EMAILS` | Recommandé | Emails administrateurs | Non | Autorisation Super-Admin |
| `AEROMIND_TRIAL_EMAILS` | Optionnel | Emails d’essai | Non | Parcours d’essai OIDC |
| `ENTRA_TENANT_ID` | Optionnel | ID tenant | Non | SSO Entra |
| `ENTRA_CLIENT_ID` | Optionnel | ID application | Non | SSO Entra |
| `ENTRA_CLIENT_SECRET` | Optionnel | Secret Entra | Oui | SSO Entra |
| `ENTRA_REDIRECT_URI` | Optionnel | URL callback HTTPS | Non | SSO Entra |
| `OIDC_ISSUER` | Optionnel | Issuer HTTPS | Non | OIDC générique |
| `OIDC_CLIENT_ID` | Optionnel | Client ID | Non | OIDC générique |
| `OIDC_CLIENT_SECRET` | Optionnel | Secret client | Oui | OIDC générique |
| `OIDC_REDIRECT_URI` | Optionnel | URL callback HTTPS | Non | OIDC générique |
| `OPENAI_API_KEY` | Optionnel | Clé provider | Oui | Modèles OpenAI-compatible |
| `OPENAI_API_BASE` | Optionnel | `https://api.openai.com/v1` | Non | Base API LLM |
| `OPENAI_MODEL` | Optionnel | `gpt-5-mini` | Non | Modèle LLM |
| `AEROMIND_GEOFENCE` | Optionnel | JSON geofence | Non | Limites déclaratives |
| `AEROMIND_MAVLINK_URL` | Gateway requis | URL MAVLink accessible | Peut contenir secret | Compatibilité MAVLink |
| `AEROMIND_MAVLINK_OBSERVER_URL` | Gateway requis | URL MAVLink read-only | Non | Télémétrie observateur |
| `AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S` | Optionnel | `5` | Non | Timeout heartbeat |
| `AEROMIND_MAVLINK_RECONNECT_INTERVAL_S` | Optionnel | `5` | Non | Délai reconnexion |

## 8. Vérification après déploiement

Remplacer `<service>` par le domaine Render réel :

```bash
curl -fsS https://<service>.onrender.com/api/ready
curl -fsS https://<service>.onrender.com/api/health
curl -fsS https://<service>.onrender.com/api/capabilities
curl -fsS https://<service>.onrender.com/api/telemetry/mavlink/status
```

Résultats attendus :

- `/api/ready` répond HTTP 200 et confirme la disponibilité applicative ;
- `/api/health` confirme le mode production et la connexion base ;
- `/api/capabilities` ne doit pas déclarer de contrôle matériel actif ;
- l’endpoint MAVLink read-only expose un statut explicite sans envoyer de commande.

En cas de problème OIDC, vérifier en priorité : l’issuer, le client ID, le secret, le callback HTTPS exact, les cookies HTTPS et `AEROMIND_ALLOWED_ORIGINS`.

## 9. Fichiers préparés

- `render.yaml` : Blueprint Render mis à jour avec PostgreSQL, secrets et variables MAVLink.
- `.env.example` : modèle local complet.
- `Dockerfile` : build frontend + runtime FastAPI.

## Références

[1]: https://render.com/docs/postgresql-creating-connecting "Render PostgreSQL — créer et connecter une base"
[2]: https://render.com/docs/web-services "Render Web Services — ports, Docker et health checks"
[3]: https://render.com/docs/configure-environment-variables "Render — variables d’environnement et secrets"
