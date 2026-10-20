/**
 * AeroMind · couches de vision synthétique (infrarouge / thermique).
 *
 * Ces « shaders » sont des compositions SVG/CSS appliquées à l'écran
 * d'observation simulé : aucun traitement de capteur réel, aucune mesure
 * radiométrique. Ils s'activent uniquement lorsque le scénario local est armé
 * virtuellement et restent bornés à l'affichage.
 */

export type VisionMode = "visible" | "infrarouge" | "thermique";

export const visionModes: Array<{
  id: VisionMode;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: "visible",
    label: "Vision visible",
    short: "VIS",
    description: "Image non traitée de la source d’observation.",
  },
  {
    id: "infrarouge",
    label: "Vision infrarouge",
    short: "IR",
    description: "Contraste de luminance renforcé et bruit de capteur simulés.",
  },
  {
    id: "thermique",
    label: "Vision thermique",
    short: "THERM",
    description: "Palette radiométrique simulée et détection de points chauds.",
  },
];

export function VisionShaderOverlay({
  mode,
  armed,
  gainPct = 62,
  levelPct = 48,
}: {
  mode: VisionMode;
  armed: boolean;
  gainPct?: number;
  levelPct?: number;
}) {
  if (!armed || mode === "visible") {
    return (
      <>
        <svg className="vision-filter-defs" aria-hidden="true" width="0" height="0">
          <defs>
            <filter id="aeromind-ir-filter">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise">
                <animate attributeName="seed" values="1;9;1" dur="1.6s" repeatCount="indefinite" />
              </feTurbulence>
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0 0 0 0 0.55  0 0 0 0 0.72  0 0 0 0 0.78  0 0 0 0.42 0"
                result="grain"
              />
              <feComposite in="grain" in2="SourceGraphic" operator="over" />
            </filter>
            <filter id="aeromind-thermal-filter">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="3" result="plumes">
                <animate attributeName="baseFrequency" values="0.010 0.028;0.016 0.034;0.010 0.028" dur="9s" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="plumes" scale="26" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <linearGradient id="aeromind-ironbow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#08127a" stopOpacity="0.72" />
              <stop offset="26%" stopColor="#8a1fd0" stopOpacity="0.6" />
              <stop offset="52%" stopColor="#e0343c" stopOpacity="0.58" />
              <stop offset="76%" stopColor="#f5a623" stopOpacity="0.56" />
              <stop offset="100%" stopColor="#fdfbd4" stopOpacity="0.62" />
            </linearGradient>
          </defs>
        </svg>
        <div className="vision-idle-note">
          {armed
            ? "VISION VISIBLE · activez IR ou THERM pour les couches de contraste simulées."
            : "Couches de vision inactives · armez le scénario local pour les activer."}
        </div>
      </>
    );
  }

  if (mode === "infrarouge") {
    return (
      <div className="vision-layer vision-ir" aria-label="Couche de vision infrarouge simulée">
        <svg className="vision-filter-defs" aria-hidden="true" width="0" height="0">
          <defs>
            <filter id="aeromind-ir-filter-active">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5" result="noise">
                <animate attributeName="seed" values="2;11;4;2" dur="1.9s" repeatCount="indefinite" />
              </feTurbulence>
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0 0 0 0 0.62  0 0 0 0 0.78  0 0 0 0 0.82  0 0 0 0.5 0"
                result="grain"
              />
              <feComposite in="grain" in2="SourceGraphic" operator="over" />
            </filter>
            <filter id="aeromind-ir-luminance">
              <feColorMatrix type="matrix" values="0.34 0.5 0.16 0 0.02  0.34 0.5 0.16 0 0.04  0.34 0.5 0.16 0 0.06  0 0 0 1 0" />
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude="1.25" exponent="0.72" offset="0" />
                <feFuncG type="gamma" amplitude="1.25" exponent="0.74" offset="0" />
                <feFuncB type="gamma" amplitude="1.25" exponent="0.8" offset="0" />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>
        <span className="vision-tint vision-ir-tint" aria-hidden="true" />
        <span className="vision-noise" aria-hidden="true" />
        <span className="vision-scanline" aria-hidden="true" />
        <div className="vision-hud" aria-live="polite">
          <strong>
            <i /> IR · CONTRASTE SIMULÉ
          </strong>
          <span>GAIN {gainPct}%</span>
          <span>NIVEAU {levelPct}%</span>
        </div>
        <span className="vision-corner vision-corner-tl" aria-hidden="true" />
        <span className="vision-corner vision-corner-br" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="vision-layer vision-thermal" aria-label="Couche de vision thermique simulée">
      <svg className="vision-filter-defs" aria-hidden="true" width="0" height="0">
        <defs>
          <filter id="aeromind-thermal-active">
            <feTurbulence type="fractalNoise" baseFrequency="0.014 0.03" numOctaves="3" seed="9" result="plumes">
              <animate attributeName="baseFrequency" values="0.012 0.03;0.02 0.038;0.012 0.03" dur="11s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="plumes" scale="30" xChannelSelector="R" yChannelSelector="G" result="warped" />
            <feGaussianBlur in="warped" stdDeviation="1.4" />
          </filter>
        </defs>
      </svg>
      <span className="vision-tint vision-thermal-tint" aria-hidden="true" />
      <span className="vision-plumes" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="vision-scanline" aria-hidden="true" />
      <div className="vision-spots" aria-hidden="true">
        <span className="vision-spot spot-chaud" title="Point chaud synthétique" />
        <span className="vision-spot spot-tiede" />
        <span className="vision-spot spot-froid" />
      </div>
      <div className="vision-hud vision-hud-thermal">
        <strong>
          <i /> THERM · PALETTE RADIOMÉTRIQUE SIMULÉE
        </strong>
        <span>ÉCHELLE 18 °C → 74 °C</span>
        <span>MESURE NON VALIDÉE</span>
      </div>
      <div className="vision-palette" aria-hidden="true">
        <span />
        <small>FROID</small>
        <small>CHAUD</small>
      </div>
    </div>
  );
}
