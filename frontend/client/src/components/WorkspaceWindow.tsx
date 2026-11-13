import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize2, Minimize2, Move, RotateCcw, Scaling, X } from "lucide-react";

type WindowLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
};

type WorkspaceWindowProps = {
  viewId: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

const STORAGE_KEY = "aeromind-window-layouts-v2";
const DRONE_SIZE_STORAGE_KEY = "aeromind-drone-display-size-v1";
const MIN_WIDTH = 420;
const MIN_HEIGHT = 300;
type DroneDisplaySize = "adaptable" | "moyen" | "grand" | "tres-elargi";
const DEFAULT_LAYOUT: WindowLayout = {
  x: 24,
  y: 24,
  width: 1100,
  height: 720,
  minimized: false,
  maximized: false,
  zIndex: 2,
};
// CAHIER DES CHARGES 2026-10-30 :
//   - CENTRE PARAMETRIC, SIMULATION & ANALYSES, MISSION PLANNER et RAPPORT
//     doivent s'afficher en plein écran (fenêtre maximisée) plutôt que comme
//     petites fenêtres flottantes 1100x720 mal intégrées. On les ajoute donc
//     à FULL_WORKSPACE_VIEWS.
const FULL_WORKSPACE_VIEWS = new Set([
  "design-studio",
  "engineering-hub",
  "construction",
  "digital-twin",
  "tools",
  "inspector",
  "intelligence-center",
  "parametric-center",
  "mechanical-center",
  "simulation",
  "mission-planner",
  "mission-center",
  "report",
  "aero-center",
  "design-studio",
  "satellite-nav",
]);
// Ces vues occupent le tableau maître comme le HUB, tout en conservant leur
// barre d’outils et leurs panneaux manipulables.
const MASTER_CANVAS_VIEWS = new Set([
  "parametric-center",
  "mechanical-center",
  "digital-twin",
  "mission-center",
  "simulation",
  "aero-center",
  "design-studio",
  "satellite-nav",
]);
const VIEW_LAYOUTS: Record<string, Partial<WindowLayout>> = {
  simulation: { x: 18, y: 76, width: 1280, height: 820 },
  live: { x: 18, y: 76, width: 1540, height: 940 },
  labbench: { x: 28, y: 84, width: 1180, height: 760 },
  report: { x: 32, y: 84, width: 1120, height: 740 },
};

function loadLayouts(): Record<string, WindowLayout> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function clampLayout(layout: WindowLayout): WindowLayout {
  const sidebarWidth = window.innerWidth > 900 ? 248 : window.innerWidth > 760 ? 238 : 0;
  const minX = sidebarWidth ? sidebarWidth + 18 : 12;
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - minX - 12);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 100);
  return {
    ...layout,
    width: Math.min(Math.max(layout.width, MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(layout.height, MIN_HEIGHT), maxHeight),
    x: Math.max(
      minX,
      Math.min(layout.x, Math.max(minX, window.innerWidth - layout.width - 12))
    ),
    y: Math.max(
      76,
      Math.min(layout.y, Math.max(76, window.innerHeight - layout.height - 12))
    ),
  };
}

export function WorkspaceWindow({
  viewId,
  title,
  children,
  onClose,
}: WorkspaceWindowProps) {
  const [layout, setLayout] = useState<WindowLayout>(() => {
    const saved = loadLayouts()[viewId];
    const preset = VIEW_LAYOUTS[viewId] ?? {};
    const upgradeLegacyLiveSize = viewId === "live" && saved?.width === 1280 && saved?.height === 820;
    // CAHIER DES CHARGES 2026-10-30 : pour les vues plein écran, on force
    // systématiquement maximized=true afin d'ignorer un état précédemment
    // sauvegardé comme fenêtre flottante.
    const forceMaximized = FULL_WORKSPACE_VIEWS.has(viewId);
    return clampLayout({
      ...DEFAULT_LAYOUT,
      ...preset,
      ...saved,
      ...(upgradeLegacyLiveSize ? { width: preset.width, height: preset.height } : {}),
      minimized: forceMaximized ? false : (saved?.minimized ?? false),
      maximized: forceMaximized || (saved?.maximized ?? false),
      zIndex: 10,
    });
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [droneSize, setDroneSize] = useState<DroneDisplaySize>(() => {
    try {
      const saved = window.localStorage.getItem(DRONE_SIZE_STORAGE_KEY);
      return saved === "moyen" || saved === "grand" || saved === "tres-elargi" || saved === "adaptable"
        ? saved
        : "adaptable";
    } catch {
      return "adaptable";
    }
  });
  const interactionRef = useRef<{
    mode: "drag" | "resize";
    edge?: string;
    startX: number;
    startY: number;
    start: WindowLayout;
  } | null>(null);

  useEffect(() => {
    const layouts = loadLayouts();
    layouts[viewId] = layout;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  }, [layout, viewId]);

  useEffect(() => {
    const recalculate = () => setLayout(current => current.maximized ? current : clampLayout(current));
    window.addEventListener("resize", recalculate);
    return () => window.removeEventListener("resize", recalculate);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
      if (interaction.mode === "drag") {
        setLayout(current =>
          clampLayout({
            ...current,
            x: interaction.start.x + dx,
            y: interaction.start.y + dy,
          })
        );
        return;
      }
      const edge = interaction.edge ?? "";
      let x = interaction.start.x;
      let y = interaction.start.y;
      let width = interaction.start.width;
      let height = interaction.start.height;
      if (edge.includes("e")) width += dx;
      if (edge.includes("s")) height += dy;
      if (edge.includes("w")) {
        x += dx;
        width -= dx;
      }
      if (edge.includes("n")) {
        y += dy;
        height -= dy;
      }
      setLayout(current => clampLayout({ ...current, x, y, width, height }));
    };
    const stopInteraction = () => {
      interactionRef.current = null;
      setIsInteracting(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopInteraction);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopInteraction);
    };
  }, []);

  const beginInteraction = (
    event: ReactPointerEvent,
    mode: "drag" | "resize",
    edge?: string
  ) => {
    if (layout.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = {
      mode,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      start: layout,
    };
    setIsInteracting(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      mode === "drag" ? "grabbing" : `${edge}-resize`;
  };

  const toggleMaximize = () =>
    setLayout(current => ({
      ...current,
      maximized: !current.maximized,
      minimized: false,
    }));
  const reset = () => setLayout(clampLayout({
    ...DEFAULT_LAYOUT,
    ...(VIEW_LAYOUTS[viewId] ?? {}),
    minimized: false,
    maximized: FULL_WORKSPACE_VIEWS.has(viewId),
    zIndex: 10,
  }));

  return (
    <section
      data-workspace-view={viewId}
      className={`workspace-window workspace-window-${viewId} ${layout.maximized ? "is-maximized" : ""} ${layout.minimized ? "is-minimized" : ""} ${isInteracting ? "is-interacting" : ""} ${MASTER_CANVAS_VIEWS.has(viewId) ? "is-master-canvas" : ""}`}
      data-drone-size={MASTER_CANVAS_VIEWS.has(viewId) ? droneSize : undefined}
      style={
        layout.maximized
          ? undefined
          : {
              left: layout.x,
              top: layout.y,
              width: layout.width,
              height: layout.minimized ? "auto" : layout.height,
              zIndex: layout.zIndex,
            }
      }
      onPointerDown={() =>
        setLayout(current => ({
          ...current,
          zIndex: current.zIndex < 100 ? 100 : current.zIndex + 1,
        }))
      }
      aria-label={`Fenêtre ${title}`}
    >
      <header className="workspace-window-bar">
        <button
          className="workspace-window-drag-handle"
          onPointerDown={event => beginInteraction(event, "drag")}
          title="Déplacer la fenêtre"
        >
          <Move size={14} />
          <span>
            <small>{viewId === "engineering-hub" ? "ESPACE MAÎTRE / POSTE D’INGÉNIERIE" : "SOUS-VUE INDÉPENDANTE"}</small>
            <strong>{title}</strong>
          </span>
        </button>
        <div className="workspace-window-actions">
          {MASTER_CANVAS_VIEWS.has(viewId) && (
            <div className="workspace-drone-size" role="group" aria-label="Taille d’affichage du drone">
              <span><Scaling size={13} /> DRONE</span>
              {(["moyen", "grand", "tres-elargi", "adaptable"] as DroneDisplaySize[]).map(size => (
                <button
                  key={size}
                  type="button"
                  className={droneSize === size ? "is-active" : ""}
                  aria-pressed={droneSize === size}
                  title={`Afficher le drone en taille ${size === "tres-elargi" ? "très élargie" : size}`}
                  onClick={() => {
                    setDroneSize(size);
                    window.localStorage.setItem(DRONE_SIZE_STORAGE_KEY, size);
                  }}
                >
                  {size === "tres-elargi" ? "Très élargi" : size[0].toUpperCase() + size.slice(1)}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="icon-button"
            title="Réinitialiser la position et la taille"
            aria-label="Réinitialiser la fenêtre"
            onClick={reset}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            title={layout.minimized ? "Restaurer" : "Réduire"}
            aria-label={layout.minimized ? "Restaurer" : "Réduire"}
            onClick={() =>
              setLayout(current => ({
                ...current,
                minimized: !current.minimized,
              }))
            }
          >
            {layout.minimized ? (
              <Maximize2 size={15} />
            ) : (
              <Minimize2 size={15} />
            )}
          </button>
          <button
            type="button"
            className="icon-button"
            title={layout.maximized ? "Restaurer la taille" : "Agrandir"}
            aria-label={layout.maximized ? "Restaurer la taille" : "Agrandir"}
            onClick={toggleMaximize}
          >
            {layout.maximized ? (
              <Minimize2 size={15} />
            ) : (
              <Maximize2 size={15} />
            )}
          </button>
          <button
            type="button"
            className="icon-button"
            title="Fermer la fenêtre"
            aria-label="Fermer la fenêtre"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </header>
      {!layout.minimized && (
        <div className="workspace-window-content">{children}</div>
      )}
      {!layout.maximized &&
        !layout.minimized &&
        ["n", "ne", "e", "se", "s", "sw", "w", "nw"].map(edge => (
          <span
            key={edge}
            className={`workspace-resize-handle handle-${edge}`}
            onPointerDown={event => beginInteraction(event, "resize", edge)}
            aria-hidden="true"
          />
        ))}
    </section>
  );
}
