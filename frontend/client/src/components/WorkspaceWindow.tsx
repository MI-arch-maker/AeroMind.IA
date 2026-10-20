import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize2, Minimize2, Move, RotateCcw, X } from "lucide-react";

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
const MIN_WIDTH = 420;
const MIN_HEIGHT = 300;
const DEFAULT_LAYOUT: WindowLayout = {
  x: 24,
  y: 24,
  width: 1100,
  height: 720,
  minimized: false,
  maximized: false,
  zIndex: 2,
};
const FULL_WORKSPACE_VIEWS = new Set(["design-studio", "construction", "digital-twin", "tools", "inspector"]);

function loadLayouts(): Record<string, WindowLayout> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function clampLayout(layout: WindowLayout): WindowLayout {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 100);
  return {
    ...layout,
    width: Math.min(Math.max(layout.width, MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(layout.height, MIN_HEIGHT), maxHeight),
    x: Math.max(
      12,
      Math.min(layout.x, Math.max(12, window.innerWidth - layout.width - 12))
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
    return clampLayout({ ...DEFAULT_LAYOUT, ...saved, maximized: saved?.maximized ?? FULL_WORKSPACE_VIEWS.has(viewId), zIndex: 10 });
  });
  const [isInteracting, setIsInteracting] = useState(false);
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
  const reset = () => setLayout({ ...DEFAULT_LAYOUT, zIndex: 10 });

  return (
    <section
      data-workspace-view={viewId}
      className={`workspace-window ${layout.maximized ? "is-maximized" : ""} ${layout.minimized ? "is-minimized" : ""} ${isInteracting ? "is-interacting" : ""}`}
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
            <small>SOUS-VUE INDÉPENDANTE</small>
            <strong>{title}</strong>
          </span>
        </button>
        <div className="workspace-window-actions">
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
