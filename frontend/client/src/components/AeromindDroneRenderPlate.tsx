import type { DroneCatalogDesign } from "../lib/droneCatalog";

export type DroneRenderPreset = "studio-pbr" | "xray-hybrid" | "night-ops" | "studio-blueprint";

export function AeromindDroneRenderPlate({ design, preset, wingspanM, lengthM, motorCount }: { design: DroneCatalogDesign; preset: DroneRenderPreset; wingspanM: number; lengthM: number; motorCount: number }) {
  const key = String(design.key || "").toLowerCase();
  const isMulti = key.includes("quad") || key.includes("multi") || key.includes("hex") || key.includes("octo") || motorCount >= 4;
  const isVtol = key.includes("vtol");

  const silhouette = isMulti ? (
    <>
      <line x1="150" y1="88" x2="290" y2="212" strokeWidth="8" strokeLinecap="round" />
      <line x1="290" y1="88" x2="150" y2="212" strokeWidth="8" strokeLinecap="round" />
      <rect x="195" y="125" width="50" height="50" rx="10" />
      <circle cx="150" cy="88" r="28" fillOpacity="0.18" />
      <circle cx="290" cy="88" r="28" fillOpacity="0.18" />
      <circle cx="150" cy="212" r="28" fillOpacity="0.18" />
      <circle cx="290" cy="212" r="28" fillOpacity="0.18" />
    </>
  ) : isVtol ? (
    <>
      <path d="M 220 42 Q 234 75 234 115 L 400 132 L 400 148 L 234 144 L 234 210 L 275 228 L 275 238 L 165 238 L 165 228 L 206 210 L 206 144 L 40 148 L 40 132 L 206 115 Q 206 75 220 42 Z" />
      <line x1="135" y1="95" x2="135" y2="185" strokeWidth="5" />
      <line x1="305" y1="95" x2="305" y2="185" strokeWidth="5" />
      <circle cx="135" cy="95" r="18" fillOpacity="0.2" />
      <circle cx="135" cy="185" r="18" fillOpacity="0.2" />
      <circle cx="305" cy="95" r="18" fillOpacity="0.2" />
      <circle cx="305" cy="185" r="18" fillOpacity="0.2" />
    </>
  ) : (
    <path d="M 220 38 Q 235 72 235 112 L 408 134 L 408 150 L 235 144 L 235 212 L 280 232 L 280 242 L 160 242 L 160 232 L 205 212 L 205 144 L 32 150 L 32 134 L 205 112 Q 205 72 220 38 Z" />
  );

  if (preset === "xray-hybrid") {
    return (
      <svg viewBox="0 0 880 410" style={{ width: "100%", height: "auto", display: "block" }}>
        <rect width="880" height="410" fill="#040b14" />
        <g transform="translate(220,52)" fill="rgba(56,189,248,0.12)" stroke="#38bdf8" strokeWidth="1.6">{silhouette}</g>
        <line x1="255" y1="192" x2="625" y2="192" stroke="#0ea5e9" strokeWidth="5" strokeDasharray="10 4" />
        <rect x="424" y="116" width="32" height="40" rx="4" fill="#06b6d4" fillOpacity="0.75" stroke="#67e8f9" />
        <rect x="422" y="168" width="36" height="44" rx="4" fill="#10b981" fillOpacity="0.7" stroke="#6ee7b7" />
        <line x1="440" y1="116" x2="440" y2="270" stroke="#f97316" strokeWidth="3" />
        <circle cx="440" cy="192" r="10" fill="#ffffff" stroke="#38bdf8" strokeWidth="3" />
        <text x="458" y="196" fill="#ffffff" fontFamily="monospace" fontSize="12" fontWeight="bold">CG</text>
        <text x="28" y="32" fill="#22d3ee" fontFamily="monospace" fontSize="12" fontWeight="bold">HYBRIDE X-RAY · STRUCTURE INTERNE — {design.label.toUpperCase()}</text>
        <text x="28" y="388" fill="#7dd3fc" fontFamily="monospace" fontSize="11">BATTERIE LI-ION HD | LONGERON CARBONE | BUS CAN/MAVLINK2 | ENVERGURE {wingspanM.toFixed(2)} m</text>
      </svg>
    );
  }

  if (preset === "night-ops") {
    return (
      <svg viewBox="0 0 880 410" style={{ width: "100%", height: "auto", display: "block" }}>
        <rect width="880" height="410" fill="#020a08" />
        <circle cx="440" cy="205" r="160" fill="none" stroke="rgba(16,185,129,0.28)" strokeWidth="1.2" />
        <circle cx="440" cy="205" r="105" fill="none" stroke="rgba(16,185,129,0.22)" strokeDasharray="6 4" />
        <line x1="240" y1="205" x2="640" y2="205" stroke="rgba(16,185,129,0.25)" />
        <line x1="440" y1="28" x2="440" y2="382" stroke="rgba(16,185,129,0.25)" />
        <g transform="translate(220,52)" fill="rgba(6,78,59,0.45)" stroke="#34d399" strokeWidth="2">{silhouette}</g>
        <circle cx="252" cy="192" r="5" fill="#ef4444" />
        <circle cx="628" cy="192" r="5" fill="#22c55e" />
        <text x="28" y="32" fill="#34d399" fontFamily="monospace" fontSize="12" fontWeight="bold">NIGHT-OPS HUD · CAPTEURS EO/IR — {design.label.toUpperCase()}</text>
        <text x="28" y="388" fill="#6ee7b7" fontFamily="monospace" fontSize="11">RADAR TACTIQUE ACTIF | SPAN {wingspanM.toFixed(2)} m | LONGUEUR {lengthM.toFixed(2)} m | {motorCount} MOTEUR(S)</text>
      </svg>
    );
  }

  if (preset === "studio-blueprint") {
    return (
      <svg viewBox="0 0 880 410" style={{ width: "100%", height: "auto", display: "block" }}>
        <rect width="440" height="410" fill="#070d17" />
        <rect x="440" width="440" height="410" fill="#072846" />
        <line x1="440" y1="0" x2="440" y2="410" stroke="#38bdf8" strokeWidth="1.5" />
        <g transform="translate(10,55) scale(0.95)" fill="#334155" stroke="#cbd5e1" strokeWidth="1.8">{silhouette}</g>
        <g transform="translate(455,55) scale(0.95)" fill="rgba(56,189,248,0.12)" stroke="#7dd3fc" strokeWidth="1.6">{silhouette}</g>
        <line x1="485" y1="318" x2="840" y2="318" stroke="#38bdf8" strokeWidth="1.2" />
        <text x="662" y="338" textAnchor="middle" fill="#e0f2fe" fontFamily="monospace" fontSize="12" fontWeight="bold">SPAN : {wingspanM.toFixed(2)} m · LENGTH : {lengthM.toFixed(2)} m</text>
        <text x="24" y="30" fill="#38bdf8" fontFamily="monospace" fontSize="11" fontWeight="bold">STUDIO PBR · {design.label.toUpperCase()}</text>
        <text x="462" y="30" fill="#7dd3fc" fontFamily="monospace" fontSize="11" fontWeight="bold">BLUEPRINT COTÉ · PROJECTION SI</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 880 410" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <radialGradient id="aeromindStudioBg" cx="50%" cy="42%" r="65%"><stop offset="0%" stopColor="#1e293b" /><stop offset="100%" stopColor="#050911" /></radialGradient>
        <linearGradient id="aeromindCarbonGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#94a3b8" /><stop offset="45%" stopColor="#334155" /><stop offset="100%" stopColor="#0f172a" /></linearGradient>
      </defs>
      <rect width="880" height="410" fill="url(#aeromindStudioBg)" />
      <ellipse cx="440" cy="328" rx="280" ry="38" fill="rgba(56,189,248,0.08)" stroke="rgba(148,163,184,0.2)" />
      <g transform="translate(220,52)" fill="url(#aeromindCarbonGrad)" stroke="#cbd5e1" strokeWidth="1.8">{silhouette}</g>
      <text x="28" y="32" fill="#38bdf8" fontFamily="monospace" fontSize="12" fontWeight="bold">STUDIO PBR · CARBONE &amp; TITANE — {design.label.toUpperCase()}</text>
      <text x="28" y="388" fill="#94a3b8" fontFamily="monospace" fontSize="11">CELLULE: {design.key.toUpperCase()} | ENVERGURE: {wingspanM.toFixed(2)} m | LONGUEUR: {lengthM.toFixed(2)} m | PROPULSION: {motorCount}x</text>
    </svg>
  );
}
