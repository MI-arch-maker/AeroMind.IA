import { useEffect, useState } from "react";
import { Cpu, Eye, Layers, Maximize2 } from "lucide-react";

export type HighResRenderMode = "studio-blueprint" | "xray-internal" | "night-ops";
const STORAGE_KEY = "aeromind-hd-render-mode";
type Props = { droneName?: string; airframe?: string; wingspanM?: number; lengthM?: number; massKg?: number; motorCount?: number };

const modes: Array<{ id: HighResRenderMode; label: string; src: string; badge: string; icon: typeof Eye }> = [
  { id: "studio-blueprint", label: "1. Studio PBR Carbone + Blueprint", src: "/renders/aeromind-studio-blueprint.png", badge: "PBR + CAD", icon: Eye },
  { id: "xray-internal", label: "2. Hybride X-Ray Interne (CG / Avionique)", src: "/renders/aeromind-xray.png", badge: "X-RAY", icon: Layers },
  { id: "night-ops", label: "3. Tactique Night-Ops & Radar", src: "/renders/aeromind-nightops.png", badge: "EO/IR", icon: Cpu },
];

export function AeromindHighResRenderViewport({ droneName = "CELLULE ACTIVE", airframe = "FIXED-WING", wingspanM = 3.6, lengthM = 1.85, massKg = 3.68, motorCount = 2 }: Props) {
  const [mode, setMode] = useState<HighResRenderMode>(() => {
    try { const s = window.localStorage.getItem(STORAGE_KEY) as HighResRenderMode | null; return s && modes.some(m => m.id === s) ? s : "studio-blueprint"; } catch { return "studio-blueprint"; }
  });
  const [zoom, setZoom] = useState(1);
  useEffect(() => { try { window.localStorage.setItem(STORAGE_KEY, mode); } catch {} }, [mode]);
  const current = modes.find(m => m.id === mode) ?? modes[0];
  return (
    <div className="flex flex-col gap-2.5 bg-slate-950 border border-slate-800 rounded-lg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {modes.map((item) => {
            const Icon = item.icon;
            const active = item.id === mode;
            return (
              <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition ${active ? "bg-sky-500/25 border-sky-400 text-white font-bold" : "bg-slate-900 border-slate-700 text-slate-300 hover:border-sky-500"}`}>
                <Icon size={13} /><span>{item.label}</span><b className="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300">{item.badge}</b>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setZoom(z => z === 1 ? 1.18 : 1)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-sky-400 text-xs">
          <Maximize2 size={12} /> {zoom > 1 ? "Zoom 100%" : "Inspecter HD"}
        </button>
      </div>
      <div className="relative w-full min-h-[390px] max-h-[560px] overflow-hidden rounded-md border border-slate-800 bg-black flex items-center justify-center">
        <img src={current.src} alt={droneName} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transition: "transform 0.3s ease" }} />
        <div className="absolute top-3 left-3 bg-slate-950/85 border border-sky-500/40 rounded px-2.5 py-1 font-mono text-xs text-slate-100">
          <strong className="text-sky-400">{droneName.toUpperCase()}</strong> · {airframe.toUpperCase()} · {current.badge}
        </div>
        <div className="absolute bottom-3 right-3 flex gap-3 bg-slate-950/85 border border-sky-500/40 rounded px-3 py-1 font-mono text-xs text-slate-200">
          <span>SPAN: <strong className="text-sky-400">{Number(wingspanM).toFixed(2)} m</strong></span>
          <span>LENGTH: <strong className="text-sky-400">{Number(lengthM).toFixed(2)} m</strong></span>
          <span>MASS: <strong className="text-emerald-400">{Number(massKg).toFixed(2)} kg</strong></span>
          <span>MOTORS: <strong>{motorCount}</strong></span>
        </div>
      </div>
    </div>
  );
}
