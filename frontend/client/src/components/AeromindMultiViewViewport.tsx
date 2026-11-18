import { useMemo, useState } from "react";
import { Cpu, Layers, Ruler, Shield } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { InstalledMaterial } from "../lib/aeroEngine";
import { ParametricDronePreview } from "./ParametricDronePreview";

export type EngineeringViewMode = "mechanical-real" | "parametric-mbd" | "bom-harness-xray";
type Props = { design?: DroneCatalogDesign; status?: "idle" | "flying" | "paused" | "landing"; compact?: boolean; construction?: { parts: number; massKg: number }; parts?: InstalledMaterial[]; flightState?: { pitchDeg?: number; rollDeg?: number; yawDeg?: number; throttlePct?: number }; interactive?: boolean; showGrid?: boolean; zoom?: number; cameraZoom?: number; exploded?: boolean; autoMotion?: boolean; defaultMode?: EngineeringViewMode; };
const STORAGE_KEY = "aeromind.engineering_viewport_mode";

export function AeromindMultiViewViewport({ design, compact = false, construction, parts, zoom, defaultMode = "mechanical-real" }: Props) {
  const [mode, setMode] = useState<EngineeringViewMode>(() => {
    try { const s = window.localStorage.getItem(STORAGE_KEY) as EngineeringViewMode | null; if (s && ["mechanical-real", "parametric-mbd", "bom-harness-xray"].includes(s)) return s; } catch {}
    return defaultMode;
  });
  const selectMode = (next: EngineeringViewMode) => { setMode(next); try { window.localStorage.setItem(STORAGE_KEY, next); } catch {} };

  const specs = useMemo(() => {
    const cfg = (design as any)?.configuration ?? {};
    return {
      wingspanMm: Math.round((Number(cfg.wingspan) || 1.45) * 1000),
      lengthMm: Math.round((Number(cfg.fuselageLength) || 0.92) * 1000),
      propMm: Math.round((Number(cfg.propDiameter) || 0.38) * 1000),
      massKg: construction?.massKg ?? (Number(cfg.emptyMassKg) || 3.85),
      motorCount: Number(cfg.motorCount) || 2,
    };
  }, [design, construction]);

  const bom = useMemo(() => {
    const installed = Array.isArray(parts) && parts.length > 0 ? parts : [];
    if (installed.length > 0) return installed.slice(0, 6).map((item, idx) => { const r = item as Record<string, unknown>; return { code: `PRT-${String(idx + 1).padStart(2, "0")}`, sub: String(r.name || r.label || r.category || "Sous-ensemble"), mat: String(r.material || r.materialId || "Carbone / Alliage Al-7075"), spec: `${Number(r.massKg || 0.25).toFixed(2)} kg · Qualifié MBD`, wire: "Faisceau blindé MIL-DTL-27500" }; });
    return [
      { code: "STR-01", sub: "Cellule & Longerons", mat: "Carbone T700S / Époxy", spec: `Env. ${specs.wingspanMm} mm · Long. ${specs.lengthMm} mm`, wire: "Masse structurelle · Blindage EMI" },
      { code: "PRP-02", sub: "Motopropulseur & Hélices", mat: "Alliage Al 7075-T6 / Carbone", spec: `Rotor ${specs.propMm} mm · ${specs.motorCount} moteur(s)`, wire: "3x Phase 14 AWG + DShot600" },
      { code: "PWR-03", sub: "Bus Énergie & Puissance", mat: "Li-Ion HD / XT90-S", spec: "Bus 25.2V DC Redondant", wire: "VBAT+ / GND 10 AWG · Capteur Hall" },
      { code: "AVI-04", sub: "Autopilote, IMU & GNSS", mat: "Boîtier Al 6061-T6 Anodisé", spec: "Double IMU · GNSS RTK", wire: "CAN1/CAN2 24 AWG · MAVLink2 TX/RX" },
    ];
  }, [parts, specs]);

  const btn = (active: boolean) => ({ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.7rem", borderRadius: "0.3rem", fontSize: "11px", fontWeight: 600, cursor: "pointer", background: active ? "#1d4ed8" : "#0f172a", color: active ? "#fff" : "#94a3b8", border: active ? "1px solid #38bdf8" : "1px solid #1e293b" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", background: "#060d18", border: "1px solid #1e293b", borderRadius: "0.5rem", padding: "0.65rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        <button type="button" style={btn(mode === "mechanical-real")} onClick={() => selectMode("mechanical-real")}><Shield size={13} /> 1. Mécanique Réel</button>
        <button type="button" style={btn(mode === "parametric-mbd")} onClick={() => selectMode("parametric-mbd")}><Ruler size={13} /> 2. Paramétrique MBD (SI)</button>
        <button type="button" style={btn(mode === "bom-harness-xray")} onClick={() => selectMode("bom-harness-xray")}><Layers size={13} /> 3. Pièces · Harnais · Matériaux</button>
      </div>

      {design ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ minHeight: compact ? "240px" : "360px", background: "#040a12", border: "1px solid #1e293b", borderRadius: "0.4rem", padding: "0.5rem" }}>
            <ParametricDronePreview
              design={design}
              construction={construction}
              zoom={zoom ?? 1.15}
              projection={mode === "parametric-mbd" ? "blueprint" : mode === "bom-harness-xray" ? "wireframe" : "vector"}
              showProjectionControls={true}
            />
          </div>

          {mode === "parametric-mbd" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem", background: "#091322", border: "1px solid #1e293b", borderRadius: "0.4rem", padding: "0.6rem", fontFamily: "monospace", fontSize: "11px", color: "#e2e8f0" }}>
              <div><span style={{ color: "#38bdf8", display: "block", fontSize: "9px" }}>ENVERGURE (SPAN)</span><strong>{specs.wingspanMm} mm ({(specs.wingspanMm / 1000).toFixed(2)} m)</strong></div>
              <div><span style={{ color: "#38bdf8", display: "block", fontSize: "9px" }}>LONGUEUR FUSELAGE</span><strong>{specs.lengthMm} mm ({(specs.lengthMm / 1000).toFixed(2)} m)</strong></div>
              <div><span style={{ color: "#38bdf8", display: "block", fontSize: "9px" }}>DIAMÈTRE ROTOR</span><strong>{specs.propMm} mm ({specs.motorCount}x)</strong></div>
              <div><span style={{ color: "#34d399", display: "block", fontSize: "9px" }}>MASSE STRUCTURELLE</span><strong>{specs.massKg.toFixed(2)} kg (SI)</strong></div>
            </div>
          )}

          {mode === "bom-harness-xray" && (
            <div style={{ background: "#091322", border: "1px solid #1e293b", borderRadius: "0.4rem", padding: "0.6rem", overflowX: "auto" }}>
              <div style={{ fontSize: "10px", fontFamily: "monospace", color: "#38bdf8", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Cpu size={12} /> NOMENCLATURE PIÈCES, MATÉRIAUX & HARNAIS DE CÂBLAGE — {design.label.toUpperCase()}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", color: "#cbd5e1" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8", textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>CODE</th>
                    <th style={{ padding: "4px 6px" }}>SOUS-ENSEMBLE</th>
                    <th style={{ padding: "4px 6px" }}>MATÉRIAU</th>
                    <th style={{ padding: "4px 6px" }}>COTES / SPEC</th>
                    <th style={{ padding: "4px 6px" }}>HARNAIS / BUS</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.map((row) => (
                    <tr key={row.code} style={{ borderBottom: "1px solid rgba(30,41,59,0.5)" }}>
                      <td style={{ padding: "4px 6px", fontFamily: "monospace", color: "#38bdf8" }}>{row.code}</td>
                      <td style={{ padding: "4px 6px", fontWeight: 600, color: "#f8fafc" }}>{row.sub}</td>
                      <td style={{ padding: "4px 6px" }}>{row.mat}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>{row.spec}</td>
                      <td style={{ padding: "4px 6px", color: "#34d399" }}>{row.wire}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", fontSize: "12px", border: "1px dashed #1e293b", borderRadius: "0.4rem" }}>
          Sélectionnez une cellule dans la Bibliothèque des cellules pour afficher son rendu paramétrique initial.
        </div>
      )}
    </div>
  );
}
