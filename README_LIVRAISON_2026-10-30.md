# AeroMind — Livraison finale 2026-10-30

## Contenu

Cette archive contient le projet **AeroMind** modifié selon le cahier des charges du 30 octobre 2026. Voir `CHANGEMENTS_CAHIER_CHARGES_2026-10-30.md` pour le détail exhaustif des modifications.

## Démarrage rapide (local)

```bash
# 1. Backend Python
pip install -r requirements.txt
export AEROMIND_ENV=development
export DATABASE_URL=sqlite:///./data/aeromind.db
export AEROMIND_SESSION_SECRET=dev-secret-aeromind-cahier-charges-execution-2026-10-30-strong
export AEROMIND_AUTO_CREATE_SCHEMA=true
export PORT=3000
mkdir -p data logs
python -m uvicorn web.app:app --host 0.0.0.0 --port 3000

# 2. Frontend (déjà compilé dans frontend/dist/)
#    Le bundle est servi par le backend FastAPI à /.
#    Pour recompiler après modification du source :
cd frontend
pnpm install
pnpm build
```

L'application est ensuite accessible sur `http://localhost:3000/`.

## Démarrage via le script d'entrée

```bash
./start.sh                # démarre uvicorn sur le port 3000
# ou
./start_framework.sh      # variante pour le framework Z.ai
```

## Déploiement Render / Docker

Le `Dockerfile` build le frontend avec Node 22 puis lance le backend Python 3.12 sur le port 3000. Le `render.yaml` est pré-configuré (région frankfurt, plan starter, healthcheck `/api/ready`).

```bash
docker build -t aeromind .
docker run -p 3000:3000 \
  -e AEROMIND_SESSION_SECRET="$(openssl rand -hex 32)" \
  -e AEROMIND_SUPERADMIN_EMAILS=you@example.com \
  aeromind
```

## Items du cahier des charges exécutés

1. **Réorganisation nav** : CENTRE PARAMETRIC après STUDIO IDDS · MISSION PLANNER sous SIMULATION & ANALYSES
2. **Mission Planner** : Leaflet remplacé par moteur cartographique moderne (Satellite HD / Plan tactique / Navigation IA)
3. **Affichage plein écran** : CENTRE PARAMETRIC, SIMULATION & ANALYSES, MISSION PLANNER, RAPPORT
4. **Rapport modernisé** : 6 onglets — Preuves / Construction / Mission / Simulation / Décisions / Atelier

## Vérifications

- `pnpm build` : ✓ 31,73 s — bundle 3,38 Mo (`frontend/dist/assets/index-Byap1DLW.js`)
- `/api/health` : `{"status":"ok","version":"2.0.0","db":"connected"}`
- 71 routes FastAPI chargées
- Port d'écoute : 3000 (aligné sur le proxy Caddy du framework)

## Structure

```
.
├── web/                          # Backend FastAPI (Python)
│   ├── app.py                    # Application principale (2187 lignes)
│   ├── mission_planner.py        # API mission planner
│   ├── labbench.py               # Service LabBench
│   └── ...                       # 30+ modules API
├── frontend/                     # Frontend React/Vite/TypeScript
│   ├── client/src/               # Code source
│   │   ├── pages/Home.tsx        # Workspace intégré (14425 lignes)
│   │   ├── components/           # 80+ composants
│   │   └── lib/                  # Logique métier
│   ├── dist/                     # Bundle compilé (prêt à servir)
│   ├── package.json              # scripts PORT=3000
│   └── vite.config.ts
├── migrations/                   # SQL migrations
├── tests/                        # Suite de tests
├── scripts/                      # SITL, i18n, migrations
├── engineering/                  # PDF/CAD source generators
├── docs/                         # Documentation + design references
├── Dockerfile                    # PORT=3000
├── render.yaml                   # Render Blueprint
├── requirements.txt              # Python deps
├── start.sh                      # Entry point shell
├── start_framework.sh            # Entry point framework Z.ai
├── main.py                       # Engine entry point
├── main_framework.py             # Framework Python entry point
├── .env                          # Config développement
├── .env.example                  # Modèle config
└── CHANGEMENTS_CAHIER_CHARGES_2026-10-30.md  # Détail des modifications
```
