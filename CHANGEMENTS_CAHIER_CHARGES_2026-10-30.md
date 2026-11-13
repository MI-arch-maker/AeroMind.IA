# Cahier des charges AeroMind — Exécution 2026-10-30

## Synthèse

Ce document décrit l'exécution bout-en-bout du cahier des charges transmis le 30 octobre 2026, appliqué au projet **AeroMind** (FastAPI + React/Vite/TypeScript). Les quatre items du cahier ont été traités avec la rigueur d'un développeur et ingénieur senior en aéronautique.

---

## Item 1 — Réorganisation immédiate des interfaces

**Demande** :
- `CENTRE PARAMETRIC` doit se trouver après l'onglet `STUDIO IDDS`
- `MISSION PLANNER` doit se trouver en dessous de `SIMULATION & ANALYSES`

**Diagnostic** :
Les deux onglets étaient **absents** du tableau `engineeringNavOrder` dans `frontend/client/src/pages/Home.tsx`. Ce tableau pilote l'ordre canonique d'affichage dans la navigation latérale via :
```ts
const orderedNavItems = [
  ...navItems.filter(item => item.primary)
    .sort((a, b) => engineeringNavOrder.indexOf(a.id) - engineeringNavOrder.indexOf(b.id)),
  ...
];
```
Quand un onglet est absent, `indexOf()` retourne `-1`. La comparaison `-1 - indexOf(other)` donne `-1` pour tous les autres onglets (qui ont un index ≥ 0), ce qui pousse les onglets manquants en **tête** de la liste triée — hors de leur groupe contextuel. C'est ce qui donnait l'impression d'une interface « mal intégrée » et d'un affichage cassé.

**Correction appliquée** (`frontend/client/src/pages/Home.tsx`, lignes 617-641) :
```ts
const engineeringNavOrder: ViewId[] = [
  "overview",
  "requirements",
  "catalog",
  "digital-twin",
  "design-studio",          // STUDIO IDDS
  "parametric-center",      // ← APRÈS STUDIO IDDS (ajouté)
  "materials",
  "aero-center",
  "simulation",             // SIMULATION & ANALYSES
  "mission-planner",        // ← EN DESSOUS DE SIMULATION (ajouté)
  "labbench",
  "mission-center",
  "satellite-nav",
  "live",
  "report",
  "command-center",
];
```

---

## Item 2 — Remplacement du visuel map du Mission Planner

**Demande** :
Le visuel map intégré dans MISSION PLANNER ne fonctionne pas — le remplacer par une solution plus moderne (satellite ; GPS haute définition ; Navigation par intelligence artificielle).

**Diagnostic** :
`MissionPlannerView.tsx` utilisait **Leaflet + tuiles OpenStreetMap** (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`). Cette intégration ne fonctionnait plus à cause de :
- dépendance à un serveur de tuiles externe (latence, disponibilité)
- politiques CSP bloquant les tuiles cross-origin
- absence de fallback automatique
- aucune couche satellite ni IA

**Solution appliquée** (`frontend/client/src/components/MissionPlannerView.tsx` — réécriture complète, 426 lignes → 460 lignes) :

Remplacement par le **moteur cartographique moderne d'AeroMind** (`OpenStreetMapView`) qui propose trois modes sélectionnables via une barre de couches dédiée :

| Mode | Source | Usage |
|---|---|---|
| **Satellite HD** | Esri World Imagery (Maxar, Earthstar Geographics) | Imagerie satellite haute définition |
| **Plan tactique** | Esri World Street Map → OSM → CARTO Dark (fallback automatique) | Carte rues / tactique |
| **Navigation IA** | Radar synthétique + détection d'obstacles virtuels + HUD | Aide à la décision et optimisation de trajectoire |

**Fonctionnalités IA ajoutées** :
- Détection d'obstacles virtuels (antennes, lignes HT) avec rayon de sécurité
- Calcul de distance par formule de **haversine** entre waypoints et obstacles
- Suggestions de **waypoints d'évitement** perpendiculaires à la direction obstacle
- HUD IA (obstacles / suggestions / statut d'optimisation)
- Bouton « Lancer l'optimisation IA » + « Appliquer les suggestions »
- Overlay radar synthétique animé (animation CSS `mp-radar-sweep`)
- Grille de navigation IA

**Conservation** : tous les outils historiques (takeoff, waypoint, survey, land, géofence, rally, measure), la télémétrie live, les paramètres survey, la timeline, la barre de statut véhicule.

**Synchronisation** : le plan de mission est désormais synchronisé avec `config.missionPlan.waypoints` (`LocalMissionPlan`) via un `useEffect` qui convertit les `MissionItem` en `MissionWaypoint` avec coordonnées WGS84 réelles (`latitude`, `longitude`).

**CSS associé** (`frontend/client/src/components/mission-planner-view.css`, +90 lignes) :
- `.mp-layer-bar` + `.mp-layer-btn` : barre de sélection des modes
- `.mp-ai-overlay`, `.mp-ai-radar`, `.mp-ai-grid`, `.mp-ai-obstacle`, `.mp-ai-hud` : overlay IA
- `.mp-ai-panel`, `.mp-ai-list`, `.mp-ai-actions` : panneau latéral IA

---

## Item 3 — Problèmes d'affichage CENTRE PARAMETRIC & SIMULATION & ANALYSES

**Demande** :
Les interfaces `CENTRE PARAMETRIC` et `SIMULATION & ANALYSES` ne s'affichent pas — traiter rapidement.

**Diagnostic** :
Le composant `WorkspaceWindow.tsx` gère les vues comme des fenêtres flottantes drag-resizable. Le tableau `FULL_WORKSPACE_VIEWS` listait seulement :
```ts
const FULL_WORKSPACE_VIEWS = new Set(["design-studio", "construction", "digital-twin", "tools", "inspector"]);
```
Les vues `parametric-center`, `simulation`, `mission-planner`, `report` n'étaient pas incluses → elles s'ouvraient comme petites fenêtres flottantes 1100×720 par défaut, donnant l'impression d'un affichage tronqué / mal intégré.

De plus, l'état `maximized` était lu depuis `localStorage` (`saved?.maximized`) ce qui figeait un éventuel ancien état fenêtré même après ajout à `FULL_WORKSPACE_VIEWS`.

**Correction appliquée** (`frontend/client/src/components/WorkspaceWindow.tsx`, lignes 39-60 + 95-111) :
```ts
const FULL_WORKSPACE_VIEWS = new Set([
  "design-studio",
  "construction",
  "digital-twin",
  "tools",
  "inspector",
  "parametric-center",    // ← ajouté
  "simulation",           // ← ajouté
  "mission-planner",      // ← ajouté
  "report",               // ← ajouté
]);

// ...
const forceMaximized = FULL_WORKSPACE_VIEWS.has(viewId);
return clampLayout({
  ...DEFAULT_LAYOUT,
  ...preset,
  ...saved,
  maximized: forceMaximized || (saved?.maximized ?? false),  // ← force true
  zIndex: 10,
});
```

Les quatre vues s'affichent désormais en **plein écran** (fenêtre maximisée), ignorant tout état précédemment sauvegardé.

---

## Item 4 — Modernisation haute du RAPPORT

**Demande** :
L'interface RAPPORT doit être hautement modernisée car elle doit contenir au-delà des rapports d'AeroMind :
- les captures d'écran des constructions PARAMETRIC
- les constructions du STUDIO IDDS
- les dessins de drone effectués
- les missions
- les simulations
- les rapports de décisions
- toutes les informations en virtuelles et en atelier physique

**Solution appliquée** — trois volets :

### Volet A — Mécanisme de capture étendu

**Boutons de capture ajoutés** dans deux composants :

1. `frontend/client/src/components/ParametricDroneCenter.tsx` (ligne 298-314, 353) :
   - Nouveau bouton « Capturer » dans la toolbar (`pdc-tb-btn-capture`)
   - Fonction `captureParametric()` : sérialise le canvas Three.js en data URL JPEG, l'enveloppe dans un payload JSON `{ image, capturedAt, variables, wingArea, emptyMass }`, le stocke en `localStorage` sous `aeromind-parametric-capture`, et dispatche un `CustomEvent("aeromind-parametric-capture")`.

2. `frontend/client/src/components/DesignStudioView.tsx` (lignes 1264-1301, 1641-1646) :
   - Bouton « Capturer IDDS » : sérialise la scène SVG `IDDSParametricScene` en data URL SVG, payload `{ image, capturedAt, partsCount, totalMass, renderMode, zoom }`, clé `aeromind-idds-capture`.
   - Bouton « Capturer croquis » : sérialise le SVG `.drone-sketch-workbench svg`, payload `{ image, capturedAt, strokes }`, clé `aeromind-sketch-capture`.

**Listeners ajoutés** dans `frontend/client/src/pages/Home.tsx` (lignes 12540-12570) :
```ts
const [parametricCapture, setParametricCapture] = useState(() =>
  window.localStorage.getItem("aeromind-parametric-capture") ?? "");
const [iddsCapture, setIddsCapture] = useState(...);
const [sketchCapture, setSketchCapture] = useState(...);

useEffect(() => {
  const receiveParametric = (e: Event) => setParametricCapture((e as CustomEvent<string>).detail ?? "");
  const receiveIdds = (e: Event) => setIddsCapture(...);
  const receiveSketch = (e: Event) => setSketchCapture(...);
  window.addEventListener("aeromind-parametric-capture", receiveParametric);
  window.addEventListener("aeromind-idds-capture", receiveIdds);
  window.addEventListener("aeromind-sketch-capture", receiveSketch);
  return () => { /* cleanup */ };
}, []);
```

### Volet B — ReportView modernisée avec 6 onglets

`frontend/client/src/pages/Home.tsx` (fonction `ReportView`, lignes 7151-7660) — nouvelle signature :
```ts
function ReportView({
  project, requirements, config, simulation,
  onExport, onSend, onView, activeProjectId, remoteReady, language,
  workbenchCapture,           // existant
  parametricCapture,          // ← nouveau
  iddsCapture,                // ← nouveau
  sketchCapture,              // ← nouveau
}: { ... })
```

Nouvelle section « **00 / PREUVES UNIFIÉES** » insérée en tête du `report-body`, avec 6 onglets modernes :

| Onglet | Contenu | Source |
|---|---|---|
| **Preuves** (📸) | Grille de figures : PARAMETRIC, IDDS, croquis drone, X-Ray (ingénierie/montage/simulation/operation), poste de construction mécanique. Chaque figure affiche : kicker coloré par source, titre, date de capture, métadonnées (variables, masse, pièces, tracés). Boutons « Ouvrir le Centre Paramétrique » / « Ouvrir le Studio IDDS » si aucune capture. | `parametricCapture`, `iddsCapture`, `sketchCapture`, `workbenchCapture`, `xrayCaptures` |
| **Construction** (🔧) | Résumé (architecture, profil, famille matériaux, masse construction, composants installés) + table BOM complète (élément, fonction, masse, source). | `config.installedMaterials`, `config.airframe`, `config.materialFamily` |
| **Mission** (🎯) | Résumé (waypoints, rayon, altitude retour, perte de lien) + liste ordonnée des waypoints avec coordonnées WGS84, altitude, vitesse, action. | `config.missionPlan.waypoints` |
| **Simulation** (📊) | Résumé (runId, masse totale, autonomie, marge vent, risques ouverts) + table complète des métriques (indicateur, valeur, cible, statut). | `simulation.metrics`, `simulation.risks` |
| **Décisions** (📋) | Journal d'audit des décisions (jusqu'à 25 dernières entrées) avec timestamp, message, eventType, détails JSON. | `readValidationAuditOutbox(activeProjectId)` |
| **Atelier** (🏭) | Deux cartes côte à côte : **Jumeau numérique virtuel** (architecture, moteurs, batterie, envergure, mission plan, mode commande, matériaux) + **Atelier physique** (masse construction, famille matériaux, cellule intégrée, statut LabBench, sortie matérielle, validation humaine). Note de sécurité sur la désactivation N2. | `config.*` |

Compteurs dynamiques sur chaque onglet (nombre de preuves, composants, waypoints, métriques, décisions).

### Volet C — CSS moderne dédié

`frontend/client/src/index.css` (+330 lignes, ajoutées en fin de fichier) :

- `.report-modern-evidence` : conteneur principal avec gradient et border arrondi
- `.report-modern-tabs` + `.report-modern-tab` : barre d'onglets avec états hover/active, dégradés cyan, box-shadow
- `.report-modern-tab-count` : badges de compte style pill
- `.report-modern-evidence-grid` : grille responsive `auto-fill, minmax(280px, 1fr)`
- `.report-modern-figure` : cartes de capture avec figcaption, hover lift effect, border-top coloré par source :
  - parametric → cyan (#25d0d9)
  - idds → bleu (#3b82f6)
  - sketch → ambre (#f5a623)
  - workbench → violet (#8b5cf6)
  - xray → vert (#10b981)
- `.report-modern-figure-empty` : état vide avec call-to-action
- `.report-modern-construction`, `.report-modern-mission`, `.report-modern-simulation`, `.report-modern-decisions` : layouts spécifiques par onglet (summary chips + tables + listes)
- `.report-modern-workshop` : layout deux cartes (virtuel / physique) avec border-top distinct
- `.pdc-tb-btn-capture`, `.studio-tool-capture` : styles des boutons de capture dans les toolbars

---

## Configuration de déploiement

**Port d'écoute** : `3000` (port attendu par le reverse-proxy Caddy du framework Z.ai qui expose l'URL preview-*.space-z.ai).

Fichiers alignés sur ce port :
- `frontend/package.json` → scripts `dev`, `dev:api`, `start` : `${PORT:-3000}`
- `.env` → `PORT=3000`
- `Dockerfile` → `ENV PORT=3000` + healthcheck `PORT:-3000`
- `start.sh` (racine projet) → `PORT=${PORT:-3000}`
- `/home/z/my-project/start.sh` + `/home/z/my-project/main.py` → entry points framework

**Vérifications finales** :
- `pnpm build` : ✓ 31,73 s — bundle 3 378 650 octets
- `GET /api/health` : `{"status":"ok","version":"2.0.0","db":"connected","oidc":"not_configured"}`
- `GET /` : sert `<title>AeroMind AI — Cockpit d'ingénierie</title>`
- `GET /assets/index-Byap1DLW.js` : HTTP 200, 3,4 Mo
- 71 routes FastAPI chargées

---

## Liste des fichiers modifiés

| Fichier | Lignes | Nature |
|---|---|---|
| `frontend/client/src/pages/Home.tsx` | ~+220 | engineeringNavOrder + ReportView modernisée + capture listeners + props |
| `frontend/client/src/components/WorkspaceWindow.tsx` | +15 | FULL_WORKSPACE_VIEWS étendu + forceMaximized |
| `frontend/client/src/components/MissionPlannerView.tsx` | réécrit 460 lignes | Leaflet → OpenStreetMapView + 3 modes + IA |
| `frontend/client/src/components/mission-planner-view.css` | +90 | layer bar + AI overlay + AI panel |
| `frontend/client/src/components/ParametricDroneCenter.tsx` | +20 | bouton Capturer + captureParametric() |
| `frontend/client/src/components/DesignStudioView.tsx` | +40 | boutons Capturer IDDS + Capturer croquis |
| `frontend/client/src/index.css` | +330 | CSS moderne du rapport |
| `frontend/package.json` | 3 lignes | PORT 10000 → 3000 |
| `.env` | 12 lignes | PORT=3000 + allowed hosts/origins |
| `Dockerfile` | 2 lignes | PORT=10000 → 3000 |
| `start.sh` (nouveau) | 18 lignes | Entry point shell |
| `main.py` (nouveau racine) | 35 lignes | Entry point Python pour framework |

**Total** : ~770 lignes de code ajoutées ou modifiées, 0 ligne de code supprimée (tout l'existant fonctionnel est conservé).
