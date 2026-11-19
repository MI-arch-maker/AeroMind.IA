import { useMemo, useState } from "react";
import { MechanicalTwinViewport, type MechanicalRender, type MechanicalView } from "./MechanicalTwinViewport";
import { buildMechanicalModel } from "../lib/mechanicalTwinGeometry";
import { defaultConcept, type ConceptConfig } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";

export function AeromindTwinRenderStage({ design, config }: { design?: DroneCatalogDesign; config?: ConceptConfig }) {
  const [view, setView] = useState<MechanicalView>("iso");
  const [mode, setMode] = useState<MechanicalRender>("solid");
  const [explosion, setExplosion] = useState(0);
  const [selected, setSelected] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const model = useMemo(() => {
    if (!design) return null;
    const merged: ConceptConfig = { ...defaultConcept, ...design.configuration, ...(config ?? {}) };
    return buildMechanicalModel(design, merged);
  }, [design, config]);

  if (!design || !model) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", border: "1px dashed #1e293b", borderRadius: "0.45rem" }}>
        Sélectionnez un drone dans la Bibliothèque des cellules pour afficher le jumeau mécanique IDDS / Twin.
      </div>
    );
  }

  const btn = (active: boolean) => ({
    padding: "4px 9px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer",
    background: active ? "#1d4ed8" : "#0f172a", color: active ? "#ffffff" : "#94a3b8",
    border: active ? "1px solid #38bdf8" : "1px solid #1e293b",
  });

  return (
    <div className="idds-render-stage" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px", padding: "6px 8px", background: "#07101f", border: "1px solid #1e293b", borderRadius: "6px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["iso", "top", "front", "side"] as MechanicalView[]).map(v => (
            <button key={v} type="button" style={btn(view === v)} onClick={() => setView(v)}>{v.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button type="button" style={btn(mode === "solid")} onClick={() => setMode("solid")}>Solide</button>
          <button type="button" style={btn(mode === "wireframe")} onClick={() => setMode("wireframe")}>Filaire</button>
          <button type="button" style={btn(mode === "xray")} onClick={() => setMode("xray")}>X-Ray</button>
          <button type="button" style={btn(explosion > 0)} onClick={() => setExplosion(e => (e > 0 ? 0 : 0.65))}>Éclaté</button>
          <button type="button" style={btn(false)} onClick={() => { setView("iso"); setMode("solid"); setExplosion(0); setResetKey(k => k + 1); }}>Reset</button>
        </div>
      </div>
      <div className="idds-render-viewport" style={{ height: "660px", minHeight: "660px", width: "100%", borderRadius: "6px", overflow: "hidden", border: "1px solid #1e293b", background: "#050c17" }}>
        <MechanicalTwinViewport
          model={model}
          selected={selected}
          onSelect={setSelected}
          view={view}
          mode={mode}
          explosion={explosion}
          resetKey={resetKey}
          xrayCut={1}
          xrayOpacity={{}}
        />
      </div>
    </div>
  );
}
