import { AeromindDroneRenderPlate } from "./AeromindDroneRenderPlate";
import { useMemo, useState } from "react";
import { Compass, Cpu, Eye, Layers } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { InstalledMaterial } from "../lib/aeroEngine";

export type DroneRenderPreset = "studio-pbr" | "xray-hybrid" | "night-ops" | "studio-blueprint";
type Props = { design?: DroneCatalogDesign; status?: "idle" | "flying" | "paused" | "landing"; compact?: boolean; construction?: { parts: number; massKg: number }; parts?: InstalledMaterial[]; flightState?: { pitchDeg?: number; rollDeg?: number; yawDeg?: number; throttlePct?: number }; interactive?: boolean; showGrid?: boolean; zoom?: number; cameraZoom?: number; exploded?: boolean; autoMotion?: boolean; defaultMode?: string };
const STORAGE_KEY = "aeromind.active_render_preset";

const presets: Array<{ id: DroneRenderPreset; label: string; icon: typeof Eye }> = [
  { id: "studio-pbr", label: "1. Studio PBR Réaliste", icon: Eye },
  { id: "xray-hybrid", label: "2. Hybride X-Ray / Structure", icon: Layers },
  { id: "night-ops", label: "3. Tactique Night-Ops / HUD", icon: Cpu },
  { id: "studio-blueprint", label: "4. Double Vue Studio + Blueprint", icon: Compass },
];

export function AeromindMultiViewViewport({ design, compact = false, construction, parts }: Props) {
  const [preset, setPreset] = useState<DroneRenderPreset>(() => {
    try { const s = window.localStorage.getItem(STORAGE_KEY) as DroneRenderPreset | null; return s && presets.some(p => p.id === s) ? s : "studio-pbr"; } catch { return "studio-pbr"; }
  });
  const selectPreset = (next: DroneRenderPreset) => { setPreset(next); try { window.localStorage.setItem(STORAGE_KEY, next); } catch {} };

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
    if (installed.length > 0) return installed.slice(0, 6).map((item, idx) => { const r = item as Record<string, unknown>; return { code: `PRT-${String(idx + 1).padStart(2, "0")}`, sub: String(r.name || r.label || r.category || "Sous-ensemble"), mat: String(r.material || r.materialId || "Carbone / Alliage Al-7075"), spec: `${Number(r.massKg || 0.25).toFixed(2)} kg`, wire: "MIL-DTL-27500" }; });
    return [
      { code: "STR-01", sub: "Cellule & Longerons", mat: "Carbone T700S / Époxy", spec: `Env. ${specs.wingspanMm} mm · Long. ${specs.lengthMm} mm`, wire: "Blindage EMI" },
      { code: "PRP-02", sub: "Motopropulseur & Hélices", mat: "Al 7075-T6 / Carbone", spec: `Rotor ${specs.propMm} mm · ${specs.motorCount}x`, wire: "3x Phase 14 AWG" },
      { code: "PWR-03", sub: "Bus Énergie & Batterie", mat: "Li-Ion HD / XT90-S", spec: "25.2V DC Redondant", wire: "VBAT+ / GND 10 AWG" },
      { code: "AVI-04", sub: "Autopilote, IMU & GNSS", mat: "Al 6061-T6 Anodisé", spec: "Double IMU · RTK", wire: "CAN1/CAN2 · MAVLink2" },
    ];
  }, [parts, specs]);

  const btn = (active: boolean) => ({ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.7rem", borderRadius: "0.3rem", fontSize: "11px", fontWeight: 600, cursor: "pointer", background: active ? "#1d4ed8" : "#0f172a", color: active ? "#fff" : "#94a3b8", border: active ? "1px solid #38bdf8" : "1px solid #1e293b" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", background: "#060d18", border: "1px solid #1e293b", borderRadius: "0.5rem", padding: "0.65rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {presets.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" style={btn(preset === item.id)} onClick={() => selectPreset(item.id)}>
              <Icon size={13} /> {item.label}
            </button>
          );
        })}
      </div>

      {design ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ minHeight: compact ? "220px" : "340px", background: "#03070e", border: "1px solid #1e293b", borderRadius: "0.4rem", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AeromindDroneRenderPlate design={design} preset={preset} wingspanM={specs.wingspanMm / 1000} lengthM={specs.lengthMm / 1000} motorCount={specs.motorCount} />
          </div>

          {preset === "studio-blueprint" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem", background: "#091322", border: "1px solid #1e293b", borderRadius: "0.4rem", padding: "0.6rem", fontFamily: "monospace", fontSize: "11px", color: "#e2e8f0" }}>
              <div><span style={{ color: "#38bdf8", display: "block", fontSize: "9px" }}>ENVERGURE (SPAN)</span><strong>{specs.wingspanMm} mm ({(specs.wingspanMm / 1000).toFixed(2)} m)</strong></div>
              <div><span style={{ color: "#38bdf8", display: "block", fontSize: "9px" }}>LONGUEUR FUSELAGE</span><strong>{specs.lengthMm} mm ({(specs.lengthMm / 1000).toFixed(2)} m)</strong></div>
              <div><span style={{ color: "#38bdf8", display: "block", fontSize: "9px" }}>DIAMÈTRE ROTOR</span><strong>{specs.propMm} mm ({specs.motorCount}x)</strong></div>
              <div><span style={{ color: "#34d399", display: "block", fontSize: "9px" }}>MASSE STRUCTURELLE</span><strong>{specs.massKg.toFixed(2)} kg (SI)</strong></div>
            </div>
          )}

          {preset === "xray-hybrid" && (
            <div style={{ background: "#091322", border: "1px solid #1e293b", borderRadius: "0.4rem", padding: "0.6rem", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", color: "#cbd5e1" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8", textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>CODE</th><th style={{ padding: "4px 6px" }}>SOUS-ENSEMBLE</th><th style={{ padding: "4px 6px" }}>MATÉRIAU</th><th style={{ padding: "4px 6px" }}>SPEC</th><th style={{ padding: "4px 6px" }}>HARNAIS</th>
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
          Sélectionnez un drone dans la Bibliothèque des cellules pour afficher ses 4 rendus dédiés.
        </div>
      )}
    </div>
  );
}
