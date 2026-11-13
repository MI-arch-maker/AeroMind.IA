# Livraison — Modernisation LABBENCH 01

## Périmètre

Modernisation strictement visuelle et ergonomique de LABBENCH 01, sans modification des flux métier, de l’authentification, des synchronisations AeroMind, des gates ou des restrictions matérielles.

## Design livré

- Mode **Master Engineering** visible dans l’en-tête.
- Direction artistique console d’ingénierie : fond blueprint quadrillé, contraste opérateur, cyan instrumentation, amber safety states et typographie monospace pour les valeurs techniques.
- Rail de navigation plus dense et lisible, avec état actif renforcé et hiérarchie des 5 zones conservée.
- Cartes, panneaux, identité double, bandeaux de synchronisation et instrumentation avec profondeur visuelle cohérente.
- Feedback hover/focus/active plus clair pour les workflows d’ingénieur.
- Responsive desktop/tablette/mobile conservé et renforcé.

## Vérifications

- TypeScript + catalogue i18n : OK.
- Build production Vite : OK.
- CSS compilé contenant le marqueur `MASTER ENGINEERING` : OK.
- Prévisualisation `/api/ready` et `/labbench` : HTTP 200.
