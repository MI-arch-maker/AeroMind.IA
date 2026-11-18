import type { DroneCatalogDesign } from "../lib/droneCatalog";

export type DroneRenderPreset = "studio-pbr" | "xray-hybrid" | "night-ops" | "studio-blueprint";

export function AeromindDroneRenderPlate({ design, preset, wingspanM, lengthM, motorCount }: { design: DroneCatalogDesign; preset: DroneRenderPreset; wingspanM: number; lengthM: number; motorCount: number }) {
  const key = String(design.key || "").toLowerCase();
  const isMulti = key.includes("quad") || key.includes("multi") || key.includes("hex") || key.includes("octo") || motorCount >= 4;
  const isVtol = key.includes("vtol");
  const aspectRatio = ((wingspanM * wingspanM) / Math.max(0.18, wingspanM * lengthM * 0.24)).toFixed(1);
  const archCode = isMulti ? "ROTARY-UAS" : isVtol ? "HYBRID-VTOL" : "FIXED-WING-ISR";

  const renderAirframeGeometry = (mode: "pbr" | "xray" | "night" | "bp") => {
    const strokeCol = mode === "night" ? "#34d399" : mode === "xray" ? "#38bdf8" : mode === "bp" ? "#7dd3fc" : "#cbd5e1";
    const fillCol = mode === "pbr" ? "url(#natoCarbonWeave)" : mode === "xray" ? "rgba(14,165,233,0.10)" : mode === "night" ? "rgba(6,78,59,0.42)" : "rgba(56,189,248,0.14)";
    if (isMulti) {
      return (
        <g>
          <line x1="130" y1="75" x2="310" y2="225" stroke={strokeCol} strokeWidth="11" strokeLinecap="round" />
          <line x1="310" y1="75" x2="130" y2="225" stroke={strokeCol} strokeWidth="11" strokeLinecap="round" />
          <polygon points="190,115 250,115 262,150 250,185 190,185 178,150" fill={fillCol} stroke={strokeCol} strokeWidth="2" />
          {[[130, 75], [310, 75], [130, 225], [310, 225]].map(([cx, cy], idx) => (
            <g key={idx}>
              <circle cx={cx} cy={cy} r="44" fill="rgba(56,189,248,0.06)" stroke={strokeCol} strokeWidth="1.2" strokeDasharray="5 3" />
              <line x1={cx - 38} y1={cy} x2={cx + 38} y2={cy} stroke={strokeCol} strokeWidth="2.5" />
              <circle cx={cx} cy={cy} r="9" fill="#1e293b" stroke={strokeCol} strokeWidth="1.8" />
            </g>
          ))}
        </g>
      );
    }
    return (
      <g>
        <path d="M 220 26 Q 236 62 236 108 L 418 134 L 418 152 L 236 146 L 236 218 L 284 240 L 284 252 L 156 252 L 156 240 L 204 218 L 204 146 L 22 152 L 22 134 L 204 108 Q 204 62 220 26 Z" fill={fillCol} stroke={strokeCol} strokeWidth="2" />
        <rect x="52" y="143" width="128" height="6" fill="none" stroke={strokeCol} strokeWidth="1" opacity="0.75" />
        <rect x="260" y="143" width="128" height="6" fill="none" stroke={strokeCol} strokeWidth="1" opacity="0.75" />
        <circle cx="220" cy="64" r="11" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.6" />
        {isVtol && [[138, 92], [138, 192], [302, 92], [302, 192]].map(([vx, vy], i) => (
          <circle key={i} cx={vx} cy={vy} r="22" fill="rgba(56,189,248,0.08)" stroke={strokeCol} strokeWidth="1.2" strokeDasharray="4 3" />
        ))}
      </g>
    );
  };
  if (preset === "xray-hybrid") {
    return (
      <svg viewBox="0 0 920 440" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><pattern id="natoGridXray" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56,189,248,0.09)" strokeWidth="0.7" /></pattern></defs>
        <rect width="920" height="440" fill="#030913" /><rect width="920" height="440" fill="url(#natoGridXray)" />
        <g transform="translate(240,68)">
          {renderAirframeGeometry("xray")}
          <line x1="36" y1="138" x2="404" y2="138" stroke="#0284c7" strokeWidth="4.5" />
          {[65, 110, 155, 285, 330, 375].map((rx) => (<line key={rx} x1={rx} y1="126" x2={rx} y2="150" stroke="#38bdf8" strokeWidth="1.3" opacity="0.8" />))}
          <rect x="206" y="84" width="28" height="36" rx="3" fill="#06b6d4" fillOpacity="0.8" stroke="#a5f3fc" />
          <rect x="204" y="130" width="32" height="38" rx="3" fill="#10b981" fillOpacity="0.75" stroke="#6ee7b7" />
          <line x1="220" y1="64" x2="220" y2="238" stroke="#f97316" strokeWidth="2.6" />
          <circle cx="220" cy="142" r="9" fill="#ffffff" stroke="#0284c7" strokeWidth="3" />
          <text x="236" y="146" fill="#ffffff" fontFamily="monospace" fontSize="11" fontWeight="bold">CG · MAC 28%</text>
        </g>
        <g fontFamily="monospace" fontSize="10" fill="#7dd3fc">
          <text x="24" y="30" fill="#38bdf8" fontSize="12" fontWeight="bold">NATO / STANAG-4586 · COUPE X-RAY &amp; ARCHITECTURE INTERNE — {design.label.toUpperCase()}</text>
          <text x="28" y="95" fill="#67e8f9">■ BATTERIE LI-ION HD 25.2V (REDONDANTE)</text>
          <text x="28" y="115" fill="#6ee7b7">■ AUTOPILOTE DOUBLE IMU / FCC-A &amp; B</text>
          <text x="28" y="135" fill="#fdba74">■ HARNAIS BLINDÉ MIL-DTL-27500 / CAN2</text>
          <text x="24" y="418" fill="#94a3b8">CLASSIFICATION: EN-9100 / {archCode} | ENVERGURE: {wingspanM.toFixed(2)} m | LONGUEUR: {lengthM.toFixed(2)} m</text>
        </g>
      </svg>
    );
  }
  if (preset === "night-ops") {
    return (
      <svg viewBox="0 0 920 440" style={{ width: "100%", height: "auto", display: "block" }}>
        <rect width="920" height="440" fill="#020907" />
        <circle cx="460" cy="220" r="185" fill="none" stroke="rgba(16,185,129,0.28)" strokeWidth="1.2" />
        <circle cx="460" cy="220" r="130" fill="none" stroke="rgba(16,185,129,0.22)" strokeDasharray="6 4" />
        <line x1="250" y1="220" x2="670" y2="220" stroke="rgba(16,185,129,0.25)" />
        <line x1="460" y1="22" x2="460" y2="418" stroke="rgba(16,185,129,0.25)" />
        <polygon points="460,132 395,28 525,28" fill="rgba(52,211,153,0.10)" stroke="rgba(52,211,153,0.35)" strokeDasharray="4 3" />
        <g transform="translate(240,68)">{renderAirframeGeometry("night")}<circle cx="22" cy="143" r="5" fill="#ef4444" /><circle cx="418" cy="143" r="5" fill="#22c55e" /></g>
        <text x="24" y="30" fill="#34d399" fontFamily="monospace" fontSize="12" fontWeight="bold">TACTICAL NIGHT-OPS · EO/IR &amp; SIGNATURE RADAR — {design.label.toUpperCase()}</text>
        <text x="24" y="418" fill="#6ee7b7" fontFamily="monospace" fontSize="10">CAPTEUR EO/IR STABILISÉ | BALAYAGE AZIMUT 360° | SPAN {wingspanM.toFixed(2)} m | {motorCount} PROPULSEUR(S)</text>
      </svg>
    );
  }
  if (preset === "studio-blueprint") {
    return (
      <svg viewBox="0 0 920 440" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><pattern id="natoCarbonWeave" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#1e293b" /><path d="M0 4L4 0M4 8L8 4" stroke="#475569" strokeWidth="1.3" /></pattern><pattern id="bpIsoGrid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(186,230,253,0.12)" strokeWidth="0.7" /></pattern></defs>
        <rect width="460" height="440" fill="#060c16" /><rect x="460" width="460" height="440" fill="#072642" /><rect x="460" width="460" height="440" fill="url(#bpIsoGrid)" /><line x1="460" y1="0" x2="460" y2="440" stroke="#38bdf8" strokeWidth="1.5" />
        <g transform="translate(15,72) scale(0.96)">{renderAirframeGeometry("pbr")}</g>
        <g transform="translate(475,72) scale(0.96)">{renderAirframeGeometry("bp")}</g>
        <line x1="496" y1="342" x2="876" y2="342" stroke="#38bdf8" strokeWidth="1.2" />
        <text x="686" y="362" textAnchor="middle" fill="#e0f2fe" fontFamily="monospace" fontSize="11" fontWeight="bold">SPAN : {wingspanM.toFixed(2)} m · LENGTH : {lengthM.toFixed(2)} m · AR : {aspectRatio}</text>
        <text x="24" y="30" fill="#38bdf8" fontFamily="monospace" fontSize="11" fontWeight="bold">RENDU STUDIO PBR · {design.label.toUpperCase()}</text>
        <text x="480" y="30" fill="#7dd3fc" fontFamily="monospace" fontSize="11" fontWeight="bold">PLAN COTÉ ISO-128 · STANAG</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 920 440" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs><radialGradient id="natoStudioBg" cx="50%" cy="42%" r="65%"><stop offset="0%" stopColor="#1e293b" /><stop offset="100%" stopColor="#040811" /></radialGradient><pattern id="natoCarbonWeave" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#1e293b" /><path d="M0 4L4 0M4 8L8 4" stroke="#475569" strokeWidth="1.3" /></pattern></defs>
      <rect width="920" height="440" fill="url(#natoStudioBg)" /><ellipse cx="460" cy="352" rx="310" ry="42" fill="rgba(56,189,248,0.07)" stroke="rgba(148,163,184,0.25)" />
      <g transform="translate(240,68)">{renderAirframeGeometry("pbr")}</g>
      <text x="24" y="30" fill="#38bdf8" fontFamily="monospace" fontSize="12" fontWeight="bold">STUDIO PBR · CARBONE T700S &amp; TITANE — {design.label.toUpperCase()}</text>
      <text x="24" y="418" fill="#94a3b8" fontFamily="monospace" fontSize="10">STANDARD: EN-9100 / {archCode} | SPAN: {wingspanM.toFixed(2)} m | LENGTH: {lengthM.toFixed(2)} m | ALLONGEMENT: {aspectRatio} | PROPULSION: {motorCount}x</text>
    </svg>
  );
}
