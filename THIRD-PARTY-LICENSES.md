# AeroMind — registre des licences open source

| Composant | Usage | Licence / source | Référence |
|---|---|---|---|
| React, React DOM | Interface | MIT — npm | frontend/package.json |
| Vite | Build frontend | MIT — npm | frontend/package.json |
| FastAPI | API HTTP | MIT — PyPI | requirements.txt |
| SQLAlchemy | Persistance | MIT — PyPI | requirements.txt |
| Pydantic | Validation | MIT — PyPI | requirements.txt |
| Uvicorn | Serveur ASGI | BSD-3-Clause — PyPI | requirements.txt |
| PostgreSQL | Base de données de production | PostgreSQL License | docker-compose.yml / render.yaml |
| Leaflet | Cartographie | BSD-2-Clause — npm | frontend/package.json |
| Three.js | Visualisation 3D | MIT — npm | frontend/package.json |

Le registre est maintenu à partir des manifestes `frontend/package.json` et `requirements.txt`.
Les licences transitives doivent être régénérées avec `pnpm licenses list` et `pip-licenses` lors d’une release.
Aucun binaire propriétaire ni secret n’est inclus dans cette livraison.
