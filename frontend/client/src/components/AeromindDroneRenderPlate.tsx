import { useMemo } from "react";
import { defaultConcept, type ConceptConfig } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { buildMechanicalModel } from "../lib/mechanicalTwinGeometry";
import { prepareMechanicalPreview, projectMechanicalPreview } from "./ParametricDronePreview";

export type DroneRenderPreset = "studio-pbr" | "xray-hybrid" | "night-ops" | "studio-blueprint";

export function AeromindDroneRenderPlate({ design, preset, wingspanM, lengthM, motorCount }: { design: DroneCatalogDesign; preset: DroneRenderPreset; wingspanM: number; lengthM: number; motorCount: number }) {
  const aspectRatio = ((wingspanM * wingspanM) / Math.max(0.18, wingspanM * lengthM * 0.24)).toFixed(1);

  const { pbrPaths, bpPaths } = useMemo(() => {
    const cfg: ConceptConfig = {
      ...defaultConcept,
      ...design.configuration,
      wingspan: wingspanM,
      fuselageLength: lengthM,
      motorCount,
      airframe: design.key,
      modelType: design.modelType as ConceptConfig["modelType"],
      designName: design.label,
    };
    const model = buildMechanicalModel(design, cfg);
    const prepared = prepareMechanicalPreview(model);
    return {
      pbrPaths: projectMechanicalPreview(prepared, { yaw: 38, pitch: 26 }, "perspective"),
      bpPaths: projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "blueprint"),
    };
  }, [design, wingspanM, lengthM, motorCount]);

  if (preset === "xray-hybrid") {
    return (
      <svg viewBox="0 0 920 430" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><pattern id="natoGridXray" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56,189,248,0.09)" strokeWidth="0.7" /></pattern></defs>
        <rect width="920" height="430" fill="#030913" /><rect width="920" height="430" fill="url(#natoGridXray)" />
        {/* Architecture interne X-Ray */}
        <g transform="translate(105,36) scale(2.2)">
          <line x1="95" y1="84" x2="225" y2="84" stroke="#0284c7" strokeWidth="2.2" />
          <rect x="153" y="64" width="14" height="16" rx="1.5" fill="#06b6d4" fillOpacity="0.85" stroke="#a5f3fc" strokeWidth="0.6" />
          <rect x="152" y="83" width="16" height="18" rx="1.5" fill="#10b981" fillOpacity="0.8" stroke="#6ee7b7" strokeWidth="0.6" />
          <line x1="160" y1="54" x2="160" y2="116" stroke="#f97316" strokeWidth="1.4" />
          {pbrPaths.map((p, i) => (<path key={i} d={p.d} fill="#0ea5e9" fillOpacity={0.22} stroke="#38bdf8" strokeWidth="0.45" />))}
          <circle cx="160" cy="84" r="4" fill="#ffffff" stroke="#0284c7" strokeWidth="1.4" />
        </g>
        <g fontFamily="monospace" fontSize="10" fill="#7dd3fc">
          <text x="24" y="28" fill="#38bdf8" fontSize="12" fontWeight="bold">NATO / STANAG-4586 · COUPE X-RAY &amp; ARCHITECTURE INTERNE — {design.label.toUpperCase()}</text>
          <text x="26" y="62" fill="#67e8f9">■ BATTERIE LI-ION HD 25.2V</text>
          <text x="26" y="80" fill="#6ee7b7">■ AUTOPILOTE DOUBLE IMU / FCC</text>
          <text x="26" y="98" fill="#fdba74">■ HARNAIS MIL-DTL-27500 / CAN2</text>
          <text x="26" y="116" fill="#ffffff">● REPÈRE CENTRAGE CG · MAC 28%</text>
          <text x="24" y="408" fill="#94a3b8">CELLULE: {design.key.toUpperCase()} | ENVERGURE: {wingspanM.toFixed(2)} m | LONGUEUR: {lengthM.toFixed(2)} m | {motorCount} MOTEUR(S)</text>
        </g>
      </svg>
    );
  }

  if (preset === "night-ops") {
    return (
      <svg viewBox="0 0 920 430" style={{ width: "100%", height: "auto", display: "block" }}>
        <rect width="920" height="430" fill="#020907" />
        <circle cx="460" cy="215" r="180" fill="none" stroke="rgba(16,185,129,0.28)" strokeWidth="1.2" />
        <circle cx="460" cy="215" r="125" fill="none" stroke="rgba(16,185,129,0.22)" strokeDasharray="6 4" />
        <circle cx="460" cy="215" r="70" fill="none" stroke="rgba(16,185,129,0.18)" />
        <line x1="250" y1="215" x2="670" y2="215" stroke="rgba(16,185,129,0.25)" />
        <line x1="460" y1="22" x2="460" y2="408" stroke="rgba(16,185,129,0.25)" />
        <polygon points="460,150 385,26 535,26" fill="rgba(52,211,153,0.10)" stroke="rgba(52,211,153,0.35)" strokeDasharray="4 3" />
        <g transform="translate(105,36) scale(2.2)">
          {pbrPaths.map((p, i) => (<path key={i} d={p.d} fill="#064e3b" fillOpacity={0.62} stroke="#34d399" strokeWidth="0.5" />))}
        </g>
        <text x="24" y="28" fill="#34d399" fontFamily="monospace" fontSize="12" fontWeight="bold">TACTICAL NIGHT-OPS · EO/IR &amp; SIGNATURE RADAR — {design.label.toUpperCase()}</text>
        <text x="24" y="408" fill="#6ee7b7" fontFamily="monospace" fontSize="10">CAPTEUR EO/IR STABILISÉ | BALAYAGE AZIMUT 360° | SPAN {wingspanM.toFixed(2)} m | {motorCount} PROPULSEUR(S)</text>
      </svg>
    );
  }

  if (preset === "studio-blueprint") {
    return (
      <svg viewBox="0 0 920 430" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><pattern id="bpIsoGrid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(186,230,253,0.12)" strokeWidth="0.7" /></pattern></defs>
        <rect width="460" height="430" fill="#060c16" /><rect x="460" width="460" height="430" fill="#072642" /><rect x="460" width="460" height="430" fill="url(#bpIsoGrid)" /><line x1="460" y1="0" x2="460" y2="430" stroke="#38bdf8" strokeWidth="1.5" />
        <g transform="translate(8,88) scale(1.38)">
          {pbrPaths.map((p, i) => (<path key={i} d={p.d} fill={p.color} fillOpacity={p.opacity} stroke="rgba(226,232,240,0.45)" strokeWidth="0.3" />))}
        </g>
        <g transform="translate(468,88) scale(1.38)">
          {bpPaths.map((p, i) => (<path key={i} d={p.d} fill="rgba(56,189,248,0.16)" stroke="#7dd3fc" strokeWidth="0.45" />))}
        </g>
        <line x1="496" y1="348" x2="876" y2="348" stroke="#38bdf8" strokeWidth="1.2" />
        <text x="686" y="368" textAnchor="middle" fill="#e0f2fe" fontFamily="monospace" fontSize="11" fontWeight="bold">SPAN : {wingspanM.toFixed(2)} m · LENGTH : {lengthM.toFixed(2)} m · AR : {aspectRatio}</text>
        <text x="24" y="28" fill="#38bdf8" fontFamily="monospace" fontSize="11" fontWeight="bold">RENDU STUDIO PBR · {design.label.toUpperCase()}</text>
        <text x="480" y="28" fill="#7dd3fc" fontFamily="monospace" fontSize="11" fontWeight="bold">PLAN COTÉ ISO-128 · STANAG</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 920 430" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <radialGradient id="natoStudioBg" cx="50%" cy="42%" r="65%"><stop offset="0%" stopColor="#1e293b" /><stop offset="100%" stopColor="#040811" /></radialGradient>
      </defs>
      <rect width="920" height="430" fill="url(#natoStudioBg)" />
      <ellipse cx="460" cy="346" rx="310" ry="42" fill="rgba(56,189,248,0.08)" stroke="rgba(148,163,184,0.28)" />
      <g transform="translate(105,36) scale(2.2)">
        {pbrPaths.map((p, i) => (<path key={i} d={p.d} fill={p.color} fillOpacity={p.opacity} stroke="rgba(241,245,249,0.38)" strokeWidth="0.28" />))}
      </g>
      <text x="24" y="28" fill="#38bdf8" fontFamily="monospace" fontSize="12" fontWeight="bold">STUDIO PBR · CARBONE T700S &amp; TITANE — {design.label.toUpperCase()}</text>
      <text x="24" y="408" fill="#94a3b8" fontFamily="monospace" fontSize="10">STANDARD: EN-9100 / {design.key.toUpperCase()} | SPAN: {wingspanM.toFixed(2)} m | LENGTH: {lengthM.toFixed(2)} m | ALLONGEMENT: {aspectRatio} | PROPULSION: {motorCount}x</text>
    </svg>
  );
}
