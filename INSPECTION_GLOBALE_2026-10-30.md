# Inspection globale Aeromind — 2026-10-30

## Cahier des charges exécuté

1. **CENTRE PARAMETRIC — problème d'affichage** → ✅ Corrigé
2. **SIMULATION & ANALYSES — problème d'affichage** → ✅ Corrigé
3. **Inspection tous les boutons de tous les onglets** → ✅ 11 boutons placeholder corrigés
4. **Aucune création autonome de projet** → ✅ Vérifié et confirmé

---

## Anomalie 1 — CENTRE PARAMETRIC : affichage collapsé

### Diagnostic

Le `ParametricDroneCenter.tsx` utilise un layout grid avec `height: 100%` :
```css
.pdc-app { display: grid; grid-template-rows: 36px 40px 1fr 28px; height: 100%; }
```

Mais le conteneur parent `.workspace-window-content` n'était **pas un flex container** — il avait seulement `overflow: auto` et `flex: 1`. Le `flex: 1` ne s'appliquait pas car le parent n'était pas en mode flex. Résultat : `.workspace-window-inner` n'avait pas de hauteur explicite, et `height: 100%` sur `.pdc-app` résolvait vers `auto` → l'interface collapsait à height=0.

### Correction

**`index.css`** — `.workspace-window-content` devient un flex container :
```css
.workspace-window-content {
  display: flex;          /* ← AJOUTÉ */
  flex-direction: column; /* ← AJOUTÉ */
  padding: 0;
}
```

**`index.css`** — nouvelle classe `.workspace-window-inner.is-flush` pour les vues pleine hauteur :
```css
.workspace-window-inner.is-flush {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.workspace-window-inner.is-flush > * {
  flex: 1;
  min-height: 0;
  width: 100%;
}
```

**`Home.tsx`** — application conditionnelle de la classe `is-flush` :
```tsx
const FULL_HEIGHT_VIEWS = new Set<ViewId>([
  "parametric-center",
  "mission-planner",
  "design-studio",
  "digital-twin",
]);
// ...
<div className={`workspace-window-inner ${FULL_HEIGHT_VIEWS.has(activeView) ? "is-flush" : ""}`}>
```

Note : `simulation` n'est PAS dans `FULL_HEIGHT_VIEWS` car cette vue contient deux composants empilés (AeroTestFieldStation + VirtualSimulationCenter) qui doivent scroller normalement avec le padding standard.

---

## Anomalie 2 — SIMULATION & ANALYSES : affichage

### Diagnostic

Même cause racine que l'Anomalie 1 : `.workspace-window-content` n'était pas un flex container, donc `.workspace-window-inner` n'héritait pas correctement la hauteur. Les composants `AeroTestFieldStation` et `VirtualSimulationCenter` ne pouvaient pas déterminer leur hauteur de rendu.

### Correction

La même correction CSS (`.workspace-window-content` → `display: flex; flex-direction: column`) règle ce problème. La vue Simulation utilise maintenant le mode par défaut (padding 22px, overflow auto) qui permet aux deux composants de s'afficher à leur hauteur naturelle et de scroller si nécessaire.

---

## Anomalie 3 — Boutons placeholder (toast.info sans action réelle)

### Audit

Scan systématique de tous les `onClick` dans tous les `.tsx` : **11 boutons** utilisaient `toast.info()` comme action unique (placeholder) sans modifier l'état ni déclencher d'interaction réelle.

| Fichier | Bouton | Action avant | Action après |
|---|---|---|---|
| `ParametricDroneCenter.tsx` | Nouveau | `toast.info("Nouvelle esquisse")` | `handleNew()` — reset variables aux valeurs par défaut + sync config |
| | Esquisse | `toast.info("Outil esquisse activé")` | `handleSketch()` — toggle mode esquisse (état actif visuel) |
| | Extruder | `toast.info("Extrusion")` | `handleExtrude()` — toggle mode extrusion (état actif visuel) |
| | Révolution | `toast.info("Révolution")` | `handleRevolve()` — toggle mode révolution (état actif visuel) |
| | Mesurer | `toast.info("Mesure: wingArea m²")` | `handleMeasure()` — affiche surface alaire + allongement + corde |
| | Masses | `toast.info("Masse à vide: X kg")` | `handleMasses()` — affiche masse à vide + envergure + longueur |
| | Plein écran | `toast.info("Plein écran")` | `handleFullscreen()` — toggle fullscreen API navigateur |
| | Paramètres viewport | `toast.info("Paramètres viewport")` | toggle panneau paramètres (grille, ombres, rotation, DPR, caméra, FOV) |
| | Ajouter (variable) | `toast.info("Nouvelle variable")` | `handleAddVariable()` — ajoute variable personnalisée au tableau |
| | Dupliquer (variable) | `toast.info("Dupliquer variable")` | `handleDuplicateVariable()` — duplique la variable sélectionnée |
| `MissionPlannerView.tsx` | Journal | `toast.info("Journal de vol")` | toggle panneau journal de vol (6 entrées horodatées) |

### États ajoutés

- `sketchMode`, `extrudeMode`, `revolveMode` — toggle visuel des modes d'outil (classe `is-active` sur les boutons)
- `fullscreen` — état du fullscreen API
- `showViewportSettings` — toggle du panneau de paramètres viewport
- `customVars` — liste de variables personnalisées ajoutées par l'utilisateur
- `selectedVarId` — variable sélectionnée dans le tableau (sélection cliquable)
- `showFlightLog` — toggle du panneau journal de vol (Mission Planner)

### CSS ajouté

- `.pdc-tb-btn.is-active` — état actif bouton toolbar (background cyan, bordure basse)
- `.pdc-vp-btn.is-active` — état actif bouton viewport
- `.pdc-var-table tr.is-selected` — ligne sélectionnée dans le tableau de variables
- `.pdc-vp-settings` — panneau de paramètres viewport (overlay)
- `.mp-flight-log` — panneau journal de vol (Mission Planner)

---

## Anomalie 4 — Création autonome de projet

### Inspection

**Aucune création autonome détectée.** Le code confirme explicitement l'intervention humaine :

1. **`createProject()`** (Home.tsx ligne 13390) :
   - Vérifie `authenticatedUser` → bloque si non authentifié
   - Ouvre un dialogue modal (`setCreateProjectDialogOpen(true)`)
   - L'utilisateur doit saisir un nom de projet

2. **`confirmCreateProject()`** (Home.tsx ligne 13402) :
   - Re-vérifie `authenticatedUser`
   - Utilise `newProjectName` (saisie utilisateur via dialogue)
   - Appelle `createProjectOnServer()` (API backend)

3. **`readPersistedState()`** (Home.tsx ligne 722) :
   - Filtre explicitement `demoProjectId` et `"project-local-1"` des projets restaurés
   - Retourne `emptyWorkspace` si aucun projet utilisateur n'existe

4. **Bannière workspace vierge** (Home.tsx ligne 14323-14333) :
   ```tsx
   {!activeProjectId && (
     <div className="workspace-warning" role="status">
       <strong>Workspace vierge — aucune création automatique.</strong>
       <span>Les onglets restent accessibles en mode exploration.
             Créez un projet manuellement pour enregistrer vos modifications.</span>
       <button className="secondary-button" onClick={createProject}>
         Créer manuellement
       </button>
     </div>
   )}
   ```

**Conclusion** : AeroMind ne crée jamais de projet sans intervention humaine. L'utilisateur doit (1) être authentifié, (2) cliquer "Créer manuellement", (3) saisir un nom dans le dialogue modal.

---

## Vérifications finales

```
tsc --noEmit       → exit 0     ✓ Aucune erreur TypeScript
vite build         → exit 0     ✓ Bundle index-ClrWSUqV.js (29.89s)
Python backend     → 71 routes  ✓ Charge correctement
HEAD /             → 200 OK     ✓ (avant : 405)
HEAD /api/ready    → 200 OK     ✓
HEAD /api/health   → 200 OK     ✓
Boutons placeholder → 0          ✓ (avant : 11)
Création autonome   → non        ✓ Vérifié
```

## Fichiers modifiés

| Fichier | Modifications |
|---|---|
| `index.css` | `.workspace-window-content` → flex container + classe `.is-flush` |
| `pages/Home.tsx` | Constante `FULL_HEIGHT_VIEWS` + classe conditionnelle `is-flush` |
| `components/ParametricDroneCenter.tsx` | 10 boutons opérationnels + nouveaux états + panneau paramètres + variables personnalisées |
| `components/parametric-drone-center.css` | États actifs + panneau paramètres + sélection tableau |
| `components/MissionPlannerView.tsx` | Bouton Journal → panneau journal de vol |
| `components/mission-planner-view.css` | Style panneau journal de vol |
