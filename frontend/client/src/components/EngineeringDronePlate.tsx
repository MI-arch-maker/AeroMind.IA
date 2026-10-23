import type { DroneCatalogDesign } from "../lib/droneCatalog";

type PlateProjection = "top" | "iso" | "side";
type Props = {
  design?: DroneCatalogDesign;
  status?: "idle" | "flying" | "paused" | "landing";
  construction?: { parts: number; massKg: number };
  projection?: PlateProjection;
  zoom?: number;
  emptyWhenUnselected?: boolean;
  showMiniViews?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function EngineeringDronePlate({ design, status = "idle", construction, projection = "top", zoom = 1, emptyWhenUnselected = false, showMiniViews = true }: Props) {
  if (!design && emptyWhenUnselected) {
    return (
      <div className="engineering-drone-plate is-empty" role="img" aria-label="Aucun drone sélectionné">
        <div className="engineering-drone-empty-state">
          <span className="engineering-drone-empty-crosshair" aria-hidden="true" />
          <strong>AUCUN JUMEAU NUMÉRIQUE SÉLECTIONNÉ</strong>
          <small>Choisissez une architecture ou chargez un drone depuis la Bibliothèque pour afficher sa géométrie ici.</small>
          <em>NO PROFILE · APERÇU NEUTRE · AUCUNE MAQUETTE GÉNÉRÉE</em>
        </div>
      </div>
    );
  }
  const config = design?.configuration;
  const label = design?.label ?? "Architecture non sélectionnée";
  const span = clamp(config?.wingspan ?? 0, 0, 99);
  const length = clamp(config?.fuselageLength ?? 0, 0, 99);
  const motors = Math.max(0, Math.round(config?.motorCount ?? 0));
  const isFixedWing = design?.key === "fixed-wing";
  const isVtol = design?.key === "vtol";
  const isAerostat = design?.modelType === "aérostat";
  const motionClass = status === "flying" ? "is-live" : status === "landing" ? "is-landing" : "";
  const projectionTransform = projection === "iso" ? "rotate(-11) skewY(-5)" : projection === "side" ? "scale(1 .52)" : "";
  const modelTransform = `translate(375 214) ${projectionTransform} scale(${clamp(zoom, 0.7, 1.55)})`;
  const rotorPositions = isVtol
    ? [[-112, -55], [112, -55], [-112, 55], [112, 55]]
    : [[-118, -42], [118, -42], [-118, 42], [118, 42], [-82, 0], [82, 0]];

  return (
    <div className={`engineering-drone-plate ${motionClass}`} role="img" aria-label={`Planche d’ingénierie ${label}`}>
      <svg viewBox="0 0 900 430" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="plate-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0b2730" /><stop offset="1" stopColor="#030c12" /></linearGradient>
          <linearGradient id="plate-skin" x1="0" y1="0" x2="0.8" y2="1"><stop stopColor="#e8fff9" /><stop offset="0.38" stopColor="#62bbb9" /><stop offset="1" stopColor="#123846" /></linearGradient>
          <linearGradient id="plate-wing" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#bcefe7" /><stop offset="0.55" stopColor="#287984" /><stop offset="1" stopColor="#0d2a38" /></linearGradient>
          <filter id="plate-shadow"><feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#000" floodOpacity=".55" /></filter>
        </defs>
        <rect width="900" height="430" rx="12" fill="url(#plate-bg)" />
        <path className="plate-scanline" d="M20 72H880M20 356H880" />
        <path className="plate-crosshair" d="M36 35h42M36 35v42M864 35h-42M864 35v42M36 395h42M36 395v-42M864 395h-42M864 395v-42" />
        <g className="plate-header-text"><text x="32" y="28">AEROMIND / CONSTRUCTION INSPECTOR</text><text x="868" y="28" textAnchor="end">PLATE 3A · {status === "flying" ? "LIVE SIM" : "STATIC REVIEW"}</text></g>
        <g className="plate-main-view" transform={modelTransform} filter="url(#plate-shadow)">
          <ellipse className="plate-ground-shadow" cx="0" cy="76" rx="180" ry="17" />
          {isAerostat ? <g><ellipse cx="0" cy="-10" rx="152" ry="52" fill="url(#plate-skin)" stroke="#c4fff3" strokeWidth="2" /><path d="M-122 -10H122M-98 -34Q0 -58 98 -34M-98 14Q0 38 98 14" fill="none" stroke="#75e2dc" strokeWidth="2" /><path d="M-32 35L0 62L32 35" fill="#122d3a" stroke="#b9fff1" strokeWidth="2" /><circle cx="-26" cy="-10" r="7" fill="#effffb" /><circle cx="26" cy="-10" r="7" fill="#effffb" /></g> : isFixedWing ? <g><path d="M0 -25L-190 -93L-215 -78L-76 -9L-202 68L-180 82L0 25L180 82L202 68L76 -9L215 -78L190 -93Z" fill="url(#plate-wing)" stroke="#d4fff6" strokeWidth="2" /><path d="M-190 -93L-76 -9L-202 68M190 -93L76 -9L202 68" fill="none" stroke="#9cf2e7" strokeWidth="2" /><path d="M-48 -27L48 -27L58 2L0 24L-58 2Z" fill="url(#plate-skin)" stroke="#effffb" strokeWidth="2" /><path d="M-25 -28Q0 -48 25 -28" fill="none" stroke="#effffb" strokeWidth="3" /></g> : isVtol ? <g><path d="M0 -62L45 -29H90L102 -12L90 5H45L17 22V63H-17V22L-45 5H-90L-102 -12L-90 -29H-45Z" fill="url(#plate-skin)" stroke="#d4fff6" strokeWidth="2" /><path d="M-132 -46L-30 -12M132 -46L30 -12M-132 46L-30 12M132 46L30 12" stroke="#75e2dc" strokeWidth="9" strokeLinecap="round" /><path d="M-22 -15L22 -15L31 7L0 22L-31 7Z" fill="#9ee7df" stroke="#effffb" strokeWidth="2" /></g> : <g><path d="M-22 -82Q-27 -38 -22 82H22Q27 -38 22 -82Z" fill="url(#plate-skin)" stroke="#d4fff6" strokeWidth="2" /><path d="M-22 -8L-175 -8L-175 8L-22 8M22 -8L175 -8L175 8L22 8" fill="url(#plate-wing)" stroke="#b7fff3" strokeWidth="2" /><rect x="-14" y="-19" width="28" height="45" rx="9" fill="#9be6de" stroke="#effffb" strokeWidth="2" /></g>}
          {!isFixedWing && !isAerostat && rotorPositions.slice(0, Math.min(motors || 4, rotorPositions.length)).map(([x, y], index) => <g className="engineering-plate-rotor" key={`${x}-${y}`} transform={`translate(${x} ${y})`}><circle r="22" /><path d="M-17 0Q0 -7 17 0Q0 7 -17 0M0 -17Q7 0 0 17Q-7 0 0 -17" /><circle className="plate-rotor-hub" r="4" /><text x="28" y="3">R{index + 1}</text></g>)}
        </g>
        <g className="plate-callouts"><path d="M160 136H275L315 178" /><text x="34" y="132">01 / VOLUME CELLULE</text><text x="34" y="148">PEAU · STRUCTURE · CENTRE DE GRAVITÉ</text><path d="M590 175L665 132H850" /><text x="670" y="128">02 / PROPULSION</text><text x="670" y="144">ROTORS {String(motors).padStart(2, "0")} · ÉTAT {status.toUpperCase()}</text><path d="M420 300V350H260" /><text x="34" y="348">03 / RÉFÉRENCE DIMENSIONNELLE</text><text x="34" y="364">ENVERGURE {span.toFixed(2)} M · LONGUEUR {length.toFixed(2)} M</text></g>
        {showMiniViews && <g className="plate-mini-views"><rect x="690" y="222" width="164" height="102" rx="5" /><text x="700" y="239">ORTHO / TOP</text><path d="M724 278L770 251L816 278L770 305Z" /><rect x="42" y="222" width="164" height="102" rx="5" /><text x="52" y="239">ORTHO / SIDE</text><path d="M76 280Q124 252 172 280L158 293H90Z" /></g>}
        <g className="plate-footer"><text x="32" y="410">{label.toUpperCase()} · {design?.modelType?.toUpperCase() ?? "NO PROFILE"}</text><text x="868" y="410" textAnchor="end">{construction ? `${construction.parts} PARTS · ${construction.massKg.toFixed(2)} KG · ` : ""}REVUE HUMAINE REQUISE</text></g>
      </svg>
    </div>
  );
}
