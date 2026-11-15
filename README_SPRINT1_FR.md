# AEROMIND — livraison Sprint 1 mécanique

Le centre mécanique contient un atelier CAO volumique connecté à Open CASCADE. La page `/cad-validation` expose uniquement une fixture fixe de 15 solides ; elle ne donne pas accès aux fichiers privés ni à leur import. Dans l’application, ouvrir **Centre Mécanique → CAO volumique / MBD** pour importer un STEP/BREP avec une session autorisée.

Cette livraison n’est pas une attestation de conformité totale au CCM ni une certification métrologique. Le rapport `RAPPORT_SPRINT1_FR.md` distingue les capacités démontrées des exigences restant ouvertes : calibration optique mesurée, garantie temps réel, fidélité AP242/PMI complète et réception globale.

## Démarrage local

Pré-requis : Python 3.12, Node 22+, pnpm 10.18.0. Linux doit disposer des bibliothèques natives `libgl1`, `libglu1-mesa`, `libgomp1`, `libxrender1` et `libxext6`. Les wheels CAO testées sont CadQuery 2.8.0 et cadquery-ocp 7.9.3.1.1 sur ARM64.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest pytest-asyncio
cd frontend
pnpm install --frozen-lockfile
pnpm run check
pnpm build
cd ..
# Générer un secret LOCAL ; ne pas écraser le secret d’une installation existante.
export AEROMIND_SESSION_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export AEROMIND_ENV=development
export DATABASE_URL=sqlite:///./data/sprint1-local.sqlite3
export AEROMIND_CAD_STORAGE_DIR="$PWD/data/cad"
export AEROMIND_VIRTUAL_ONLY=true HARDWARE_CONTROL=false AEROMIND_SITL_AUTOSTART=false
.venv/bin/python -m uvicorn web.app:app --host 127.0.0.1 --port 3000
```

Ouvrir `http://127.0.0.1:3000/cad-validation`. Cliquer **Charger la démo du noyau**, activer le plan de coupe, choisir X/Y/Z ou leur orientation inverse et déplacer l’offset. Observer les nouvelles faces de fermeture, les cavités, les valeurs de volume/masse/COG et la durée de calcul. Le dernier vrai solide reste affiché pendant le calcul suivant, avec un avertissement visible ; aucun clipping creux n’est présenté comme un solide validé.

Le téléchargement STEP AP242 de la démo contient les géométries et noms. Les PMI ajoutées à la démo ou par l’utilisateur ne sont pas exportées dans ce STEP. La fixture distincte `fixtures/cad/semantic_pmi_ap242.step` contient une dimension 10 mm +8/−5 µm, un parallélisme 8 µm et un datum A natifs, utilisés pour contrôler l’import sémantique.

## Reproduction des preuves

```bash
.venv/bin/python scripts/generate_cad_evidence.py
.venv/bin/python -m pytest tests/test_cad_kernel.py tests/test_cad_capability.py tests/test_cad_external_references.py tests/test_cad_body_limit.py tests/test_cad_review_fixes.py -q
cd frontend
pnpm test
pnpm run check
pnpm build
cd ..
.venv/bin/python scripts/validate_sprint1_backend.py --output evidence/reproduced
```

Le dernier lanceur utilise une base et un stockage temporaires et désactive tout contrôle matériel. Il exclut trois fichiers exigeant un environnement PostgreSQL ou une configuration distincte. La suite backend générale conserve des échecs de référence ; sa sortie non nulle ne doit pas être masquée. Les contrôles CAO dédiés et la comparaison de non-régression figurent sous `evidence/sprint1/`.

## Intégration et stockage

`web/cad_kernel.py` calcule les propriétés sur le B-Rep ; le maillage sert exclusivement au rendu. `web/cad_api.py` applique l’authentification, l’isolation propriétaire, la protection d’origine des mutations cookie et la persistance avec empreintes SHA-256. `SolidCadWorkbench.tsx` gère les matériaux PBR nominaux, les interactions de coupe, l’inspecteur de faces et les PMI. Les références STEP externes sont refusées avant transfert natif ; elles ne sont pas suivies.

Configurer `AEROMIND_CAD_STORAGE_DIR` sur un **volume persistant privé** avant un déploiement de production. Un dossier dans un conteneur éphémère ne constitue pas un archivage durable. Le Dockerfile fournit un chemin accessible au compte non-root, mais ne crée pas de volume géré ni de sauvegarde distante. Ne jamais placer ce dossier dans la racine publique. Les modèles persistés sont liés à l’utilisateur ; l’identifiant du modèle est conservé dans la configuration du projet.

Les mutations import exigent le niveau L3 dans la politique globale ; les modifications matériaux/PMI exigent L2 et restent isolées par propriétaire. Les cookies doivent provenir d’une origine de confiance. Pour un proxy de confiance dont l’origine publique diffère de celle reçue par le serveur, configurer explicitement `AEROMIND_CAD_ALLOWED_ORIGINS` et les paramètres d’en-têtes proxy de l’infrastructure. Ne pas utiliser de wildcard.

## Conditions de réception industrielle

Les densités sont des références nominales, pas des mesures de lot. Les roughness/metalness/anisotropies sont paramétrées, pas des BRDF mesurées. La trame carbone est une texture métrique planaire, pas un modèle de drapage ou de stratification. Les tolérances PMI sont des spécifications stockées au micron, pas une démonstration de précision de fabrication. Les modificateurs GD&T complexes restent signalés non interprétés.

Le contrôle natif est sérialisé dans le processus. Les tailles et complexités sont bornées, mais il n’y a pas de coupe à cadence temps réel garantie, de délai d’exécution natif dur, de certification réglementaire ou de validation complète de tous les profils AP242. Ne pas autoriser la fabrication sur la seule base de cette livraison.
