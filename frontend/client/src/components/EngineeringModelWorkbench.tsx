import { useId, useState } from "react";
import {
  Box,
  Eye,
  EyeOff,
  Layers3,
  Maximize2,
  Rotate3D,
  ScanLine,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";

type ModelView = "isometric" | "plan" | "profile";
type ModelLayer =
  | "Structure"
  | "Propulsion"
  | "Avionique"
  | "Charge utile"
  | "Train";
const layers: Array<{ id: ModelLayer; short: string }> = [
  { id: "Structure", short: "Structure" },
  { id: "Propulsion", short: "Propulsion" },
  { id: "Avionique", short: "Avionique" },
  { id: "Charge utile", short: "Charge utile" },
  { id: "Train", short: "Train" },
];

export function EngineeringModelWorkbench({
  config,
  onOpenStudio,
}: {
  config: ConceptConfig;
  onOpenStudio: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const [view, setView] = useState<ModelView>("isometric");
  const [exploded, setExploded] = useState(22);
  const [showDimensions, setShowDimensions] = useState(true);
  const [visible, setVisible] = useState<Record<ModelLayer, boolean>>({
    Structure: true,
    Propulsion: true,
    Avionique: true,
    "Charge utile": true,
    Train: true,
  });
  const configured = Boolean(config.airframe);
  const quad = config.airframe === "quadcopter";
  const vtol = config.airframe === "vtol";
  const motors = Math.max(0, Math.round(config.motorCount ?? 0));
  const span = config.wingspan > 0 ? config.wingspan : undefined;
  const length = config.fuselageLength > 0 ? config.fuselageLength : undefined;
  const dimensions = span && length;
  const toggleLayer = (layer: ModelLayer) =>
    setVisible(current => ({ ...current, [layer]: !current[layer] }));
  const modelTransform =
    view === "plan"
      ? "translate(460 262) rotate(-3) scale(1.08 0.84) translate(-460 -262)"
      : view === "profile"
        ? "translate(460 262) rotate(5) scale(0.95 0.48) translate(-460 -262)"
        : "translate(460 262) rotate(-9) skewY(-5) translate(-460 -262)";

  return (
    <section
      className="model-workbench"
      aria-label="Atelier de visualisation de la maquette paramétrique"
    >
      <div className="model-workbench-toolbar">
        <div
          className="model-view-tabs"
          role="group"
          aria-label="Orientation du modèle"
        >
          {(["isometric", "plan", "profile"] as const).map(mode => (
            <button
              key={mode}
              className={view === mode ? "is-active" : ""}
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
            >
              {mode === "isometric" ? (
                <Rotate3D size={13} />
              ) : mode === "plan" ? (
                <Layers3 size={13} />
              ) : (
                <ScanLine size={13} />
              )}
              {mode === "isometric"
                ? "Isométrique"
                : mode === "plan"
                  ? "Plan"
                  : "Profil"}
            </button>
          ))}
        </div>
        <button
          className={`model-dimensions-toggle ${showDimensions ? "is-active" : ""}`}
          onClick={() => setShowDimensions(value => !value)}
          aria-pressed={showDimensions}
        >
          <SlidersHorizontal size={13} /> Cotes {showDimensions ? "ON" : "OFF"}
        </button>
      </div>

      <div className={`model-stage ${!configured ? "is-unconfigured" : ""}`}>
        <div className="model-stage-hud model-stage-hud-left">
          <span className="model-status-led" />
          {configured ? "GÉOMÉTRIE PARAMÉTRIQUE" : "ESQUISSE DE RÉFÉRENCE"}
          <small>
            {config.airframe?.toUpperCase() ?? "ARCHITECTURE À DÉFINIR"}
          </small>
        </div>
        <div className="model-stage-hud model-stage-hud-right">
          <span>
            VUE {view === "isometric" ? "AXONOMÉTRIQUE" : view.toUpperCase()}
          </span>
          <small>
            {configured
              ? `${motors} MOTEUR(S) · UNITÉS SI`
              : "APERÇU ILLUSTRATIF · AUCUNE COTE"}
          </small>
        </div>
        <svg
          className="model-stage-svg"
          viewBox="0 0 920 520"
          role="img"
          aria-label={
            configured
              ? `Vue paramétrique ${view} de ${config.designName ?? "la maquette drone"}`
              : "Esquisse illustrative de drone, architecture non sélectionnée"
          }
        >
          <defs>
            <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0.9" y2="1">
              <stop stopColor="#d7fff6" />
              <stop offset=".42" stopColor="#72c9c4" />
              <stop offset="1" stopColor="#20525b" />
            </linearGradient>
            <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#39858b" />
              <stop offset="1" stopColor="#102e38" />
            </linearGradient>
            <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#e3fff8" />
              <stop offset="1" stopColor="#75e2dc" />
            </linearGradient>
            <pattern
              id={`${id}-grid`}
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M32 0H0V32"
                fill="none"
                stroke="rgba(117,226,220,.075)"
                strokeWidth="1"
              />
            </pattern>
            <filter
              id={`${id}-shadow`}
              x="-40%"
              y="-40%"
              width="180%"
              height="190%"
            >
              <feGaussianBlur in="SourceAlpha" stdDeviation="12" />
              <feOffset dy="14" />
              <feComponentTransfer>
                <feFuncA type="linear" slope=".42" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id={`${id}-arrow`}
              markerWidth="7"
              markerHeight="7"
              refX="3.5"
              refY="3.5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L7 3.5L0 7Z" fill="#75e2dc" />
            </marker>
          </defs>
          <rect width="920" height="520" fill={`url(#${id}-grid)`} />
          <ellipse
            cx="460"
            cy="337"
            rx="292"
            ry="88"
            fill="rgba(66,186,178,.055)"
            stroke="rgba(117,226,220,.14)"
            strokeDasharray="4 8"
          />
          <path
            d="M110 382L460 448L810 382M220 310L460 354L700 310"
            fill="none"
            stroke="rgba(117,226,220,.12)"
            strokeWidth="1"
          />
          <g
            className={`workbench-airframe model-view-${view}`}
            transform={modelTransform}
            filter={`url(#${id}-shadow)`}
          >
            {visible.Structure &&
              (quad ? (
                <g className="model-structure">
                  <path
                    d="M460 249L305 161L285 174L425 272L285 343L305 356L460 279L615 356L635 343L495 272L635 174L615 161Z"
                    fill={`url(#${id}-side)`}
                    stroke="#9fece2"
                    strokeWidth="2"
                  />
                  <path
                    d="M460 247L303 162L289 173L431 272L289 344L304 354L460 276L616 354L631 344L489 272L631 173L617 162Z"
                    fill={`url(#${id}-top)`}
                    stroke="#d1fff5"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M430 246Q460 226 490 246L504 283Q460 301 416 283Z"
                    fill={`url(#${id}-top)`}
                    stroke="#e3fff8"
                    strokeWidth="2"
                  />
                  <path
                    d="M439 251L460 237L481 251L478 266L460 278L442 266Z"
                    fill="#1a3b46"
                    stroke="#75e2dc"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M447 256L460 247L473 256L460 268Z"
                    fill={`url(#${id}-glass)`}
                    opacity=".9"
                  />
                </g>
              ) : (
                <g className="model-structure">
                  <path
                    d="M460 226L184 179L160 194L405 280L160 356L188 371L460 306L732 371L760 356L515 280L760 194L736 179Z"
                    fill={`url(#${id}-side)`}
                    stroke="#8cddd5"
                    strokeWidth="2"
                  />
                  <path
                    d="M460 220L181 177L160 190L401 278L160 352L186 364L460 298L734 364L760 352L519 278L760 190L739 177Z"
                    fill={`url(#${id}-top)`}
                    stroke="#d8fff6"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M207 189L404 263L414 276L171 202Z"
                    fill="rgba(231,255,250,.55)"
                  />
                  <path
                    d="M713 189L516 263L506 276L749 202Z"
                    fill="rgba(19,60,68,.42)"
                  />
                  <path
                    d="M424 278Q421 250 433 205L445 119Q460 103 475 119L487 205Q499 250 496 278L514 339L460 361L406 339Z"
                    fill={`url(#${id}-side)`}
                    stroke="#c4faf0"
                    strokeWidth="2"
                  />
                  <path
                    d="M433 278Q433 247 442 204L452 126Q460 116 468 126L478 204Q487 247 487 278L501 333L460 347L419 333Z"
                    fill={`url(#${id}-top)`}
                    stroke="#ecfff8"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M438 186L460 135L482 186L477 224L460 239L443 224Z"
                    fill={`url(#${id}-glass)`}
                    stroke="#eefefa"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M416 325L460 347L504 325"
                    fill="none"
                    stroke="#b8fff2"
                    strokeWidth="2"
                  />
                  <path
                    d="M405 325L368 377L383 383L426 341M515 325L552 377L537 383L494 341"
                    fill={`url(#${id}-side)`}
                    stroke="#8bddd4"
                    strokeWidth="2"
                  />
                  {vtol && (
                    <g className="model-vtol-booms">
                      <path
                        d="M306 199L361 226M614 199L559 226M306 350L361 321M614 350L559 321"
                        stroke="#75e2dc"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    </g>
                  )}
                </g>
              ))}
            {visible.Propulsion && (
              <g
                className="model-propulsion"
                transform={`translate(0 ${exploded * -0.22})`}
              >
                {(quad
                  ? [
                      [305, 174],
                      [615, 174],
                      [305, 344],
                      [615, 344],
                    ]
                  : vtol
                    ? [
                        [305, 198],
                        [615, 198],
                        [305, 350],
                        [615, 350],
                      ]
                    : [
                        [381, 375],
                        [539, 375],
                      ]
                ).map(([x, y], index) => (
                  <g key={index} transform={`translate(${x} ${y})`}>
                    <ellipse
                      rx={quad ? 42 : 29}
                      ry="11"
                      cy="6"
                      fill="rgba(2,10,14,.5)"
                    />
                    <circle
                      r={quad ? 28 : 22}
                      fill={`url(#${id}-side)`}
                      stroke="#bdfff3"
                      strokeWidth="2"
                    />
                    <circle
                      r={quad ? 18 : 13}
                      fill="#0b222b"
                      stroke="#75e2dc"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M-4 -3Q-22 -25 -36 -18M4 3Q22 25 36 18"
                      fill="none"
                      stroke="#dbfff6"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle r="4" fill="#edbd73" />
                  </g>
                ))}
                {!quad && !vtol && (
                  <g transform="translate(460 125)">
                    <ellipse
                      rx="58"
                      ry="8"
                      fill="none"
                      stroke="#b8fff2"
                      strokeWidth="2"
                    />
                    <ellipse
                      rx="8"
                      ry="35"
                      fill="none"
                      stroke="#75e2dc"
                      strokeWidth="2"
                    />
                    <circle r="5" fill="#edbd73" />
                  </g>
                )}
              </g>
            )}
            {visible.Avionique && (
              <g
                className="model-avionics"
                transform={`translate(0 ${exploded * 0.22})`}
              >
                <path
                  d="M448 267L460 258L472 267L460 279Z"
                  fill="#a994e8"
                  stroke="#eee6ff"
                  strokeWidth="1.5"
                />
                <circle cx="460" cy="268" r="4" fill="#fff" />
                <path
                  d="M442 285L460 294L478 285"
                  fill="none"
                  stroke="#a994e8"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              </g>
            )}
            {visible["Charge utile"] && (
              <g
                className="model-payload"
                transform={`translate(0 ${exploded * 0.48})`}
              >
                <path
                  d="M435 294L460 284L485 294L482 325L460 336L438 325Z"
                  fill="#112f38"
                  stroke="#ffc26c"
                  strokeWidth="2"
                />
                <path
                  d="M443 299L460 292L477 299L475 320L460 327L445 320Z"
                  fill="#17424c"
                  stroke="#edbd73"
                  strokeWidth="1.2"
                />
                <circle
                  cx="460"
                  cy="311"
                  r="7"
                  fill="#091b21"
                  stroke="#b8fff2"
                  strokeWidth="2"
                />
                <circle cx="460" cy="311" r="2.3" fill="#75e2dc" />
              </g>
            )}
            {visible.Train && (
              <g className="model-landing-gear">
                <path
                  d="M433 322L415 383M487 322L505 383"
                  stroke="#89cfc8"
                  strokeWidth="4"
                />
                <circle
                  cx="414"
                  cy="386"
                  r="8"
                  fill="#10232b"
                  stroke="#b8fff2"
                  strokeWidth="2"
                />
                <circle
                  cx="506"
                  cy="386"
                  r="8"
                  fill="#10232b"
                  stroke="#b8fff2"
                  strokeWidth="2"
                />
              </g>
            )}
          </g>
          {showDimensions && (
            <g
              className="model-dimension-lines"
              fill="none"
              stroke="#75e2dc"
              strokeWidth="1.2"
            >
              <path
                d="M170 414V452M750 414V452M170 445H750"
                markerStart={`url(#${id}-arrow)`}
                markerEnd={`url(#${id}-arrow)`}
              />
              <path
                d="M770 202L814 184M770 354L814 336M808 190V330"
                markerStart={`url(#${id}-arrow)`}
                markerEnd={`url(#${id}-arrow)`}
              />
              <path
                d="M410 395L386 433M510 395L534 433M393 426H527"
                markerStart={`url(#${id}-arrow)`}
                markerEnd={`url(#${id}-arrow)`}
              />
              <text x="460" y="439" textAnchor="middle">
                {span
                  ? `ENVERGURE ${span.toFixed(2)} m`
                  : "ENVERGURE · À RENSEIGNER"}
              </text>
              <text
                x="819"
                y="267"
                textAnchor="middle"
                transform="rotate(-90 819 267)"
              >
                {length
                  ? `FUSELAGE ${length.toFixed(2)} m`
                  : "LONGUEUR · À RENSEIGNER"}
              </text>
              <text x="460" y="420" textAnchor="middle">
                {config.chord > 0
                  ? `CORDE ${config.chord.toFixed(2)} m`
                  : "GÉOMÉTRIE CONCEPTUELLE"}
              </text>
            </g>
          )}
          <g className="model-axis-gizmo">
            <circle cx="72" cy="441" r="2.5" fill="#e5fff8" />
            <path
              d="M72 441L112 441M72 441L72 406M72 441L49 458"
              strokeWidth="2"
            />
            <text x="118" y="445">
              X
            </text>
            <text x="69" y="398">
              Z
            </text>
            <text x="36" y="466">
              Y
            </text>
          </g>
          <g className="model-callouts">
            <path d="M477 266L572 122H663" />
            <circle cx="477" cy="266" r="3" />
            <text x="670" y="118">
              AVIONIQUE / NAVIGATION
            </text>
            <path d="M476 310L590 395H682" />
            <circle cx="476" cy="310" r="3" />
            <text x="688" y="399">
              BAIE CHARGE UTILE
            </text>
          </g>
        </svg>
        {!configured && (
          <div className="model-unconfigured-note">
            <Box size={14} /> Schéma de référence uniquement · choisissez une
            architecture pour charger des géométries et cotes propres au projet.
          </div>
        )}
        {configured && !dimensions && (
          <div className="model-unconfigured-note">
            <ScanLine size={13} /> Architecture sélectionnée · renseignez les
            dimensions pour afficher les cotes.
          </div>
        )}
      </div>

      <div className="model-workbench-controls">
        <div className="model-layer-controls">
          <div className="model-controls-title">
            <Layers3 size={13} /> <span>CALQUES VUE 3D</span>
          </div>
          <div className="model-layer-chips">
            {layers.map(layer => (
              <button
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className={visible[layer.id] ? "is-visible" : ""}
                aria-pressed={visible[layer.id]}
                title={`${visible[layer.id] ? "Masquer" : "Afficher"} le calque ${layer.id}`}
              >
                {visible[layer.id] ? <Eye size={12} /> : <EyeOff size={12} />}{" "}
                {layer.short}
              </button>
            ))}
          </div>
        </div>
        <label className="model-explode-control">
          <span>
            <Maximize2 size={13} /> <strong>ÉCLATÉ</strong>{" "}
            <small>{exploded}%</small>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={exploded}
            onChange={event => setExploded(Number(event.target.value))}
            aria-label="Degré d’éclatement de la vue d’assemblage"
          />
        </label>
      </div>
      <div className="model-workbench-footer">
        <span>
          <span className="model-status-led" />{" "}
          {configured
            ? "PARAMÈTRES SYNCHRONISÉS"
            : "EN ATTENTE D’UNE CONFIGURATION"}
        </span>
        <span>PROPORTIONS CONCEPTUELLES · REVUE HUMAINE OBLIGATOIRE</span>
        <button onClick={onOpenStudio}>
          <Wrench size={12} /> Ouvrir le Studio CAO
        </button>
      </div>
    </section>
  );
}
