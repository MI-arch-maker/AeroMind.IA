import { AeromindHighResRenderViewport } from "./AeromindHighResRenderViewport";

import { useMemo, useState } from "react";
import { Cpu, Layers, Ruler, Shield } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { InstalledMaterial } from "../lib/aeroEngine";
import { PhysicalDroneModel } from "./PhysicalDroneModel";
import { ParametricDronePreview } from "./ParametricDronePreview";

export type EngineeringViewMode = "mechanical-real" | "parametric-mbd" | "bom-harness-xray";
type Props = { design?: DroneCatalogDesign; status?: "idle" | "flying" | "paused" | "landing"; compact?: boolean; construction?: { parts: number; massKg: number }; parts?: InstalledMaterial[]; flightState?: { pitchDeg?: number; rollDeg?: number; yawDeg?: number; throttlePct?: number }; interactive?: boolean; showGrid?: boolean; zoom?: number; cameraZoom?: number; exploded?: boolean; autoMotion?: boolean; defaultMode?: EngineeringViewMode; };
const STORAGE_KEY = "aeromind.engineering_viewport_mode";

export function AeromindMultiViewViewport({ design, status = "idle", compact = false, construction, parts, flightState, interactive = true, showGrid = true, zoom, cameraZoom, autoMotion = false, defaultMode = "mechanical-real" }: Props) {
  const [mode, setMode] = useState<EngineeringViewMode>(() => {
    try { const s = window.localStorage.getItem(STORAGE_KEY) as EngineeringViewMode | null; if (s && ["mechanical-real", "parametric-mbd", "bom-harness-xray"].includes(s)) return s; } catch {}
    return defaultMode;
  });
  const selectMode = (next: EngineeringViewMode) => { setMode(next); try { window.localStorage.setItem(STORAGE_KEY, next); } catch {} };
  const specs = useMemo(() => {
    const cfg = (design as any)?.configuration ?? {};
    return { wingspanMm: Math.round((Number(cfg.wingspan) || 1.45) * 1000), lengthMm: Math.round((Number(cfg.fuselageLength) || 0.92) * 1000), propMm: Math.round((Number(cfg.propDiameter) || 0.38) * 1000), massKg: construction?.massKg ?? (Number(cfg.emptyMassKg) || 3.85) };
  }, [design, construction]);
  const bom = useMemo(() => {
    const installed = Array.isArray(parts) && parts.length > 0 ? parts : [];
    if (installed.length > 0) return installed.slice(0, 6).map((item, idx) => { const r = item as Record<string, unknown>; return { code: `PRT-${String(idx + 1).padStart(2, "0")}`, sub: String(r.name || r.label || r.category || "Sous-ensemble"), mat: String(r.material || r.materialId || "Carbone / Alliage Al-7075"), spec: `${Number(r.massKg || 0.25).toFixed(2)} kg · Qualifié MBD`, wire: "Faisceau blindé MIL-DTL-27500" }; });
    return [
      { code: "STR-01", sub: "Cellule & Longerons", mat: "Carbone T700S / Époxy", spec: `Env. ${specs.wingspanMm} mm · Long. ${specs.lengthMm} mm`, wire: "Masse structurelle · Blindage EMI" },
      { code: "PRP-02", sub: "Motopropulseur & Hélices", mat: "Alliage Al 7075-T6 / Carbone", spec: `Rotor ${specs.propMm} mm · ISO 1940`, wire: "3x Phase 14 AWG + DShot600" },
      { code: "PWR-03", sub: "Bus Énergie & Puissance", mat: "Li-Ion HD / XT90-S", spec: "Bus 25.2V DC Redondant", wire: "VBAT+ / GND 10 AWG · Capteur Hall" },
      { code: "AVI-04", sub: "Autopilote, IMU & GNSS", mat: "Boîtier Al 6061-T6 Anodisé", spec: "Double IMU · GNSS RTK", wire: "CAN1/CAN2 24 AWG · MAVLink2 TX/RX" },
    ];
  }, [parts, specs]);
  const btn = (active: boolean) => ({ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.32rem 0.65rem", borderRadius: "0.25rem", fontSize: "11px", fontWeight: 600, cursor: "pointer", background: active ? "#1d4ed8" : "#111827", color: active ? "#fff" : "#94a3b8", border: active ? "1px solid #3b82f6" : "1px solid #1e293b" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", width: "100%", background: "#0b1120", border: "1px solid #1e293b", borderRadius: "0.5rem", padding: "0.65rem", color: "#e2e8f0" }}>
      <div role="toolbar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          <button type="button" onClick={() => selectMode("mechanical-real")} style={btn(mode === "mechanical-real")}><Shield size={12} /> 1. Mécanique Réel</button>
          <button type="button" onClick={() => selectMode("parametric-mbd")} style={btn(mode === "parametric-mbd")}><Ruler size={12} /> 2. Paramétrique MBD (SI)</button>
          <button type="button" onClick={() => selectMode("bom-harness-xray")} style={btn(mode === "bom-harness-xray")}><Layers size={12} /> 3. Pièces · Harnais · Matériaux</button>
        </div>
        <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#64748b" }}>REF: {design?.label || "CELLULE-ACTIF"} · {specs.massKg.toFixed(2)} KG</span>
      </div>
      <div style={{ width: "100%", minHeight: compact ? "200px" : "280px" }}>
        {mode === "parametric-mbd" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {design ? <ParametricDronePreview design={design} zoom={zoom} /> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.4rem", background: "#0f172a", padding: "0.45rem 0.6rem", borderRadius: "0.25rem", border: "1px solid #1e293b", fontSize: "11px", fontFamily: "monospace" }}>
              <div><span style={{ color: "#64748b" }}>ENVERGURE:</span> <b>{specs.wingspanMm} mm</b></div>
              <div><span style={{ color: "#64748b" }}>FUSELAGE:</span> <b>{specs.lengthMm} mm</b></div>
              <div><span style={{ color: "#64748b" }}>ROTOR:</span> <b>{specs.propMm} mm</b></div>
              <div><span style={{ color: "#64748b" }}>MASSE:</span> <b>{specs.massKg.toFixed(2)} kg</b></div>
            </div>
          </div>
        ) : (
          <AeromindHighResRenderViewport droneName={design?.label || "CELLULE ACTIVE"} airframe={design?.key || "FIXED-WING"} wingspanM={specs.wingspanMm / 1000} lengthM={specs.lengthMm / 1000} massKg={specs.massKg} motorCount={Number((design as any)?.configuration?.motorCount) || 2} />
        )}
      </div>
      {mode === "bom-harness-xray" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", background: "#0f172a", border: "1px solid #1e293b", borderRadius: "0.35rem", padding: "0.6rem", fontSize: "11px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "0.35rem" }}>
            <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#93c5fd", fontSize: "11px" }}><Cpu size={13} /> NOMENCLATURE MATÉRIELLE & HARNAIS (PIÈCE · FIL · MATÉRIAU)</strong>
            <span style={{ fontFamily: "monospace", fontSize: "10px", color: "#64748b" }}>STANAG / MIL-DTL</span>
          </div>
          {bom.map((r) => (
            <div key={r.code} style={{ display: "grid", gridTemplateColumns: "60px 1.2fr 1.2fr 1.3fr", gap: "0.5rem", padding: "0.35rem 0.45rem", background: "#0b1120", border: "1px solid #1e293b", borderRadius: "0.25rem", alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#38bdf8" }}>{r.code}</span>
              <div><div style={{ fontWeight: 600, color: "#f1f5f9" }}>{r.sub}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{r.spec}</div></div>
              <div style={{ color: "#cbd5e1" }}><span style={{ fontSize: "9px", color: "#64748b", display: "block" }}>MATÉRIAU</span>{r.mat}</div>
              <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#a5f3fc" }}><span style={{ fontSize: "9px", color: "#64748b", display: "block" }}>FAISCEAU / BUS</span>{r.wire}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
