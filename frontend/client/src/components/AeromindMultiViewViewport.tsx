import { useState } from "react";
import { Box, Layers, Compass, PenTool } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { InstalledMaterial } from "../lib/aeroEngine";
import { PhysicalDroneModel } from "./PhysicalDroneModel";
import { ParametricDronePreview } from "./ParametricDronePreview";

export type AeromindViewportMode = "3d-solid" | "3d-exploded" | "3d-wireframe" | "2d-vector";

type Props = {
  design?: DroneCatalogDesign;
  status?: "idle" | "flying" | "paused" | "landing";
  compact?: boolean;
  construction?: { parts: number; massKg: number };
  parts?: InstalledMaterial[];
  flightState?: { pitchDeg?: number; rollDeg?: number; yawDeg?: number; throttlePct?: number };
  interactive?: boolean;
  showGrid?: boolean;
  defaultMode?: AeromindViewportMode;
};

const STORAGE_KEY = "aeromind.preferred_viewport_mode";

export function AeromindMultiViewViewport({
  design,
  status = "idle",
  compact = false,
  construction,
  parts,
  flightState,
  interactive = true,
  showGrid = true,
  defaultMode = "3d-solid",
}: Props) {
  const [mode, setMode] = useState<AeromindViewportMode>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as AeromindViewportMode | null;
      if (saved && ["3d-solid", "3d-exploded", "3d-wireframe", "2d-vector"].includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore storage restrictions
    }
    return defaultMode;
  });

  const selectMode = (next: AeromindViewportMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage restrictions
    }
  };

  return (
    <div className="aeromind-multiview-wrapper" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
      <div
        className="aeromind-viewport-toolbar"
        role="toolbar"
        aria-label="Sélecteur de projection et rendu CAO"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          padding: "0.35rem",
          borderRadius: "0.5rem",
          background: "rgba(15, 23, 42, 0.72)",
          border: "1px solid rgba(148, 163, 184, 0.22)",
        }}
      >
        <button
          type="button"
          onClick={() => selectMode("3d-solid")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.3rem 0.6rem",
            borderRadius: "0.375rem",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            background: mode === "3d-solid" ? "#0284c7" : "transparent",
            color: mode === "3d-solid" ? "#ffffff" : "#cbd5e1",
            border: "none",
          }}
        >
          <Box size={13} /> 3D Volumique
        </button>
        <button
          type="button"
          onClick={() => selectMode("3d-exploded")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.3rem 0.6rem",
            borderRadius: "0.375rem",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            background: mode === "3d-exploded" ? "#0284c7" : "transparent",
            color: mode === "3d-exploded" ? "#ffffff" : "#cbd5e1",
            border: "none",
          }}
        >
          <Layers size={13} /> Vue Éclatée
        </button>
        <button
          type="button"
          onClick={() => selectMode("3d-wireframe")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.3rem 0.6rem",
            borderRadius: "0.375rem",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            background: mode === "3d-wireframe" ? "#0284c7" : "transparent",
            color: mode === "3d-wireframe" ? "#ffffff" : "#cbd5e1",
            border: "none",
          }}
        >
          <Compass size={13} /> Structure / Grille
        </button>
        <button
          type="button"
          onClick={() => selectMode("2d-vector")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.3rem 0.6rem",
            borderRadius: "0.375rem",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            background: mode === "2d-vector" ? "#0284c7" : "transparent",
            color: mode === "2d-vector" ? "#ffffff" : "#cbd5e1",
            border: "none",
          }}
        >
          <PenTool size={13} /> Plan Vectoriel 2D
        </button>
      </div>

      <div className="aeromind-viewport-canvas" style={{ width: "100%", minHeight: compact ? "190px" : "270px" }}>
        {mode === "2d-vector" ? (
          <ParametricDronePreview design={design} />
        ) : (
          <PhysicalDroneModel
            design={design}
            status={status}
            compact={compact}
            construction={construction}
            parts={parts}
            flightState={flightState}
            interactive={interactive}
            showGrid={mode === "3d-wireframe" ? true : showGrid}
            exploded={mode === "3d-exploded"}
            cameraZoom={mode === "3d-wireframe" ? 1.15 : 1}
          />
        )}
      </div>
    </div>
  );
}
