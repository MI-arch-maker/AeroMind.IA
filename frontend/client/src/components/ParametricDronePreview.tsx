import React, { type ReactNode } from "react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";

type Props = { design: DroneCatalogDesign; construction?: { parts: number; massKg: number }; zoom?: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type Point = { x: number; y: number };

function Rotor({ x, y, radius, index, ducted = false, coaxial = false }: { x: number; y: number; radius: number; index: number; ducted?: boolean; coaxial?: boolean }) {
  return <g className="legacy-svg-rotor" transform={`translate(${x} ${y})`}>
    {ducted && <circle r={radius + 4} className="legacy-svg-duct" />}
    <circle r={radius} className="legacy-svg-rotor-ring" />
    <path className="legacy-svg-rotor-blades" d={`M-${radius - 2} 0 Q-${radius / 2} -3 0 0 Q-${radius / 2} 3 -${radius - 2} 0 M${radius - 2} 0 Q${radius / 2} 3 0 0 Q${radius / 2} -3 ${radius - 2} 0`} />
    {coaxial && <circle r={radius - 3.4} className="legacy-svg-coaxial-ring" />}
    <circle r="2.4" className="legacy-svg-rotor-hub" />
    <title>{coaxial ? "Moteur coaxial" : `Rotor ${index + 1}`}</title>
  </g>;
}

function MotorSet({ positions, radius = 10, ducted = false, coaxial = false }: { positions: Point[]; radius?: number; ducted?: boolean; coaxial?: boolean }) {
  return <>{positions.map((point, index) => <Rotor key={`${point.x}-${point.y}-${index}`} {...point} radius={radius} index={index} ducted={ducted} coaxial={coaxial} />)}</>;
}

function drawArms(positions: Point[]) {
  return <g className="legacy-svg-structure">{positions.map((point, index) => <path key={index} d={`M0 0L${point.x} ${point.y}`} />)}</g>;
}

const quadPoints: Point[] = [{ x: -76, y: -34 }, { x: 76, y: -34 }, { x: -76, y: 34 }, { x: 76, y: 34 }];
const triPoints: Point[] = [{ x: 0, y: -48 }, { x: -82, y: 38 }, { x: 82, y: 38 }];
const hexPoints: Point[] = [{ x: -78, y: -34 }, { x: 0, y: -48 }, { x: 78, y: -34 }, { x: -78, y: 34 }, { x: 0, y: 48 }, { x: 78, y: 34 }];
const octoPoints: Point[] = [{ x: -82, y: -42 }, { x: -42, y: -48 }, { x: 42, y: -48 }, { x: 82, y: -42 }, { x: -82, y: 42 }, { x: -42, y: 48 }, { x: 42, y: 48 }, { x: 82, y: 42 }];

/**
 * Reusable engineering preview. Each catalog architecture receives its own
 * deterministic silhouette; dimensions remain tied to that record's parameters.
 * This is a conceptual visualization, not a certified CAD or performance model.
 */
export function ParametricDronePreview({ design, construction, zoom = 1 }: Props) {
  const config = design.configuration;
  const span = clamp(config.wingspan ?? 2, 0.7, 14);
  const length = clamp(config.fuselageLength ?? 1, 0.4, 3.2);
  const motors = Math.max(1, Math.round(config.motorCount ?? 1));
  const type = design.modelType ?? (design.key === "fixed-wing" ? "voilure-conventionnelle" : design.key === "vtol" ? "tiltrotor" : "ducted-fan");
  const morphology = design.silhouette ?? "long";
  const [rotation, setRotation] = React.useState(0);
  const rotationDrag = React.useRef<{ startX: number; angle: number } | null>(null);
  const uid = design.id.replace(/[^a-z0-9_-]/gi, "-");
  const skin = `legacy-skin-${uid}`;
  const glass = `legacy-glass-${uid}`;
  const shadow = `legacy-shadow-${uid}`;
  const grid = `legacy-grid-${uid}`;
  const visualZoom = clamp(zoom, 0.7, 1.8);
  const scaleX = clamp(span / 4.8, 0.72, 1.18);
  const scaleY = clamp(length / 1.9, 0.82, 1.1);
  const fuselage = <g className="legacy-svg-fuselage">
    <path d="M0 -48Q-8 -37 -8 -15L-10 27Q-8 42 0 50Q8 42 10 27L8 -15Q8 -37 0 -48Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
    <path d="M-6 -23Q0 -31 6 -23L5 -5Q0 0 -5 -5Z" fill={`url(#${glass})`} stroke="#eafff9" strokeWidth="1" />
    <path d="M-5 8H5M-6 25H6" className="legacy-svg-panel-line" />
    <rect x="-4" y="12" width="8" height="7" rx="2" className="legacy-svg-payload" />
  </g>;

  let geometry: ReactNode;
  if (type === "aérostat") {
    geometry = <g>
      <ellipse cx="0" cy="-3" rx="119" ry="42" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-92 -4Q-52 -37 0 -40Q52 -37 92 -4M-92 2Q-48 32 0 38Q48 32 92 2M-66 -25V20M-22 -40V35M22 -40V35M66 -25V20" className="legacy-svg-panel-line" />
      <path d="M-21 31L-12 57H12L21 31M-12 53L-37 67M12 53L37 67" className="legacy-svg-boom" />
      <rect x="-18" y="48" width="36" height="18" rx="6" fill={`url(#${glass})`} stroke="#d7fff5" />
      <Rotor x={-28} y={58} radius={9} index={0} /><Rotor x={28} y={58} radius={9} index={1} />
    </g>;
  } else if (type === "parapente") {
    geometry = <g>
      <path d="M-140 4Q-130 -45 -78 -52Q-39 -65 0 -54Q39 -65 78 -52Q130 -45 140 4Q96 -13 61 -2Q27 6 0 0Q-27 6 -61 -2Q-96 -13 -140 4Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      {[-105, -72, -38, 0, 38, 72, 105].map(x => <path key={x} d={`M${x} -43L${x * .28} 45`} className="legacy-svg-suspension" />)}
      <path d="M-42 43Q0 28 42 43L28 67H-28Z" fill={`url(#${glass})`} stroke="#d7fff5" />
      <rect x="-9" y="45" width="18" height="14" rx="4" className="legacy-svg-payload" />
      <Rotor x={0} y={70} radius={9} index={0} />
    </g>;
  } else if (type === "ornithoptère") {
    geometry = <g>
      <path d="M0 -43Q-8 -18 -7 20L0 48L7 20Q8 -18 0 -43Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-5 -17Q-52 -47 -126 -31L-145 -13Q-100 -3 -53 9L-7 7M5 -17Q52 -47 126 -31L145 -13Q100 -3 53 9L7 7Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      {[-124, -104, -83, -61, -39].map((x, i) => <path key={x} d={`M-6 -14L${x} ${-27 + i * 3}`} className="legacy-svg-feather" />)}
      {[-124, -104, -83, -61, -39].map((x, i) => <path key={x} d={`M6 -14L${-x} ${-27 + i * 3}`} className="legacy-svg-feather" />)}
      <circle cx="-11" cy="-11" r="5" className="legacy-svg-joint" /><circle cx="11" cy="-11" r="5" className="legacy-svg-joint" />
      <rect x="-6" y="12" width="12" height="15" rx="4" className="legacy-svg-payload" />
    </g>;
  } else if (type === "cyclocoptère") {
    geometry = <g>
      <path d="M-14 -42Q-17 -15 -14 42H14Q17 -15 14 -42Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      {[-88, 88].map(x => <g key={x} transform={`translate(${x} 0)`}>
        <ellipse rx="24" ry="48" fill="rgba(5,31,38,.72)" stroke="#8debe0" strokeWidth="2" />
        <ellipse rx="15" ry="39" fill="none" stroke="#b8fff2" strokeWidth="1" opacity=".8" />
        {[-25, -12, 0, 12, 25].map(y => <path key={y} d={`M-16 ${y}H16`} className="legacy-svg-cyclo-vane" />)}
        <path d="M-12 -40L0 -52L12 -40" className="legacy-svg-boom" />
      </g>)}
      <path d="M-13 -18L-88 -28M13 -18L88 -28M-13 18L-88 28M13 18L88 28" className="legacy-svg-structure" />
      <rect x="-7" y="-4" width="14" height="16" rx="4" className="legacy-svg-payload" />
    </g>;
  } else if (type === "coaxial-x8") {
    geometry = <g>
      {drawArms(quadPoints)}
      <path d="M0 -32Q-20 -18 -20 0Q-20 18 0 32Q20 18 20 0Q20 -18 0 -32Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <MotorSet positions={quadPoints} radius={12} coaxial />
      <rect x="-9" y="-7" width="18" height="18" rx="5" fill={`url(#${glass})`} stroke="#eafff9" />
    </g>;
  } else if (["ducted-fan", "tricoptère", "hexacoptère", "octocoptère"].includes(type) || design.key === "quadcopter") {
    const ducted = type === "ducted-fan" && motors <= 4;
    const basePoints = motors <= 3 ? triPoints : motors <= 4 ? quadPoints : motors <= 6 ? hexPoints : octoPoints;
    const spreadX = morphology === "flat" ? 0.82 : morphology === "long" ? 1.16 : morphology === "assistance" ? 1.08 : 1;
    const spreadY = morphology === "long" ? 0.78 : morphology === "surveillance" ? 1.16 : morphology === "flat" ? 0.9 : 1;
    const points = basePoints.map(point => ({ x: point.x * spreadX, y: point.y * spreadY }));
    const bodyPath = morphology === "flat"
      ? "M0 -27Q-24 -18 -25 0Q-24 18 0 27Q24 18 25 0Q24 -18 0 -27Z"
      : morphology === "surveillance"
        ? "M0 -42Q-15 -24 -15 0Q-15 24 0 42Q15 24 15 0Q15 -24 0 -42Z"
        : morphology === "assistance"
          ? "M0 -36Q-28 -19 -27 0Q-25 20 0 36Q25 20 27 0Q28 -19 0 -36Z"
          : "M0 -34Q-20 -20 -20 0Q-20 20 0 34Q20 20 20 0Q20 -20 0 -34Z";
    geometry = <g>
      {drawArms(points)}
      <path d={bodyPath} fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <MotorSet positions={points.slice(0, motors)} radius={ducted ? 12 : 10} ducted={ducted} />
      <path d="M-10 1Q0 -5 10 1L8 18H-8Z" fill={`url(#${glass})`} stroke="#eafff9" />
    </g>;
  } else if (["tiltrotor", "tilt-wing", "tail-sitter"].includes(type) || design.key === "vtol") {
    const hasDedicatedCruiseRotor = type !== "tail-sitter" && motors > 4;
    const liftMotorCount = hasDedicatedCruiseRotor ? motors - 1 : motors;
    const liftPoints: Point[] = liftMotorCount <= 4
      ? [{ x: -82, y: -16 }, { x: 82, y: -16 }, { x: -82, y: 18 }, { x: 82, y: 18 }]
      : liftMotorCount <= 6
        ? [{ x: -82, y: -20 }, { x: 0, y: -25 }, { x: 82, y: -20 }, { x: -82, y: 22 }, { x: 0, y: 27 }, { x: 82, y: 22 }]
        : octoPoints;
    const wing = type === "tail-sitter"
      ? "M0 -12L-120 -50L-135 -39L-58 0L-135 39L-120 50L0 12L120 50L135 39L58 0L135 -39L120 -50Z"
      : morphology === "flat"
        ? "M0 -15L-145 -34L-150 -22L-60 -2L-148 22L-138 34L0 17L138 34L148 22L60 -2L150 -22L145 -34Z"
        : morphology === "long" || morphology === "fusiform"
          ? "M0 -10L-154 -26L-160 -16L-48 -2L-154 17L-144 27L0 12L144 27L154 17L48 -2L160 -16L154 -26Z"
          : morphology === "assistance"
            ? "M0 -18L-123 -52L-137 -39L-53 -3L-132 31L-118 46L0 20L118 46L132 31L53 -3L137 -39L123 -52Z"
            : "M0 -12L-135 -48L-145 -37L-54 0L-145 37L-135 48L0 12L135 48L145 37L54 0L145 -37L135 -48Z";
    geometry = <g>
      <path d={wing} fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-50 0H50" className="legacy-svg-spar" />
      {drawArms(liftPoints)}
      {fuselage}
      <MotorSet positions={liftPoints.slice(0, liftMotorCount)} radius={type === "tail-sitter" ? 11 : 9} />
      {hasDedicatedCruiseRotor && <Rotor x={0} y={45} radius={9} index={motors - 1} />}
      <path d="M-18 34L-24 47M18 34L24 47" className="legacy-svg-boom" />
    </g>;
  } else if (type === "blended-pusher") {
    const blendedWing = morphology === "long" || morphology === "fusiform"
      ? "M-18 -31Q-72 -47 -126 -28L-158 -10L-148 10Q-84 45 -20 27L0 16L20 27Q84 45 148 10L158 -10L126 -28Q72 -47 18 -31Z"
      : morphology === "flat"
        ? "M-18 -28Q-61 -35 -104 -22L-139 -5L-127 11Q-76 34 -20 24L0 15L20 24Q76 34 127 11L139 -5L104 -22Q61 -35 18 -28Z"
        : morphology === "assistance"
          ? "M-18 -33Q-63 -46 -112 -29L-132 -14L-125 11Q-72 41 -20 25L0 16L20 25Q72 41 125 11L132 -14L112 -29Q63 -46 18 -33Z"
          : "M-18 -31Q-60 -42 -111 -24L-143 -6L-134 10Q-77 42 -21 26L0 16L21 26Q77 42 134 10L143 -6L111 -24Q60 -42 18 -31Z";
    geometry = <g>
      <path d={blendedWing} fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-33 -20L-72 -5L-139 -49L-153 -45L-104 -1L-153 42L-137 47L-69 8L-30 20M33 -20L72 -5L139 -49L153 -45L104 -1L153 42L137 47L69 8L30 20" fill="#347e84" stroke="#b7fff4" strokeWidth="1.4" />
      <path d="M-42 -15Q0 -33 42 -15L50 2L0 19L-50 2Z" fill={`url(#${glass})`} stroke="#eafff9" strokeWidth="1.4" />
      <path d="M112 -4H146M112 5H146" className="legacy-svg-prop-line" />
      <Rotor x={151} y={0} radius={11} index={0} />
      <path d="M-84 -22L-31 -4M84 -22L31 -4M-84 22L-31 4M84 22L31 4" className="legacy-svg-panel-line" />
    </g>;
  } else if (type === "aile-volante" || type === "stealth-wing") {
    const wingShape = type === "stealth-wing"
      ? "M0 -47L-147 -51L-114 -15L-150 3L-103 15L-80 39L0 55L80 39L103 15L150 3L114 -15L147 -51Z"
      : morphology === "long" || morphology === "fusiform"
        ? "M0 -45L-154 -56L-160 -45L-58 -8L-150 34L-136 47L0 19L136 47L150 34L58 -8L160 -45L154 -56Z"
        : morphology === "flat"
          ? "M0 -42L-132 -35L-147 -22L-60 -3L-142 28L-128 42L0 18L128 42L142 28L60 -3L147 -22L132 -35Z"
          : morphology === "assistance"
            ? "M0 -46L-128 -59L-144 -45L-58 -8L-136 31L-120 44L0 20L120 44L136 31L58 -8L144 -45L128 -59Z"
            : "M0 -46L-145 -66L-154 -53L-65 -7L-151 39L-137 52L0 20L137 52L151 39L65 -7L154 -53L145 -66Z";
    geometry = <g>
      <path d={wingShape} fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M0 -42V43M-109 -48L-54 -8L-114 37M109 -48L54 -8L114 37" className="legacy-svg-panel-line" />
      <path d="M-37 -28Q0 -45 37 -28L44 4L0 19L-44 4Z" fill={`url(#${glass})`} stroke="#eafff9" strokeWidth="1.4" />
      <path d="M-36 17L36 17M-29 26L29 26" className="legacy-svg-control-surface" />
      <circle cx="-6" cy="9" r="2" className="legacy-svg-sensor" /><circle cx="6" cy="9" r="2" className="legacy-svg-sensor" />
      <Rotor x={0} y={49} radius={9} index={0} />
    </g>;
  } else if (type === "tandem-wing") {
    geometry = <g>
      <path d="M0 -48Q-8 -24 -8 22L0 49L8 22Q8 -24 0 -48Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-8 -24L-112 -43L-123 -34L-52 -13L-123 2L-112 12L-8 0ZM8 18L112 1L123 12L52 30L123 45L112 54L8 39Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-85 -34L-24 -20M85 -21L24 -4M-85 6L-24 13M85 39L24 30" className="legacy-svg-panel-line" />
      <path d="M-25 47L-31 62M25 47L31 62" className="legacy-svg-boom" />
      <Rotor x={0} y={64} radius={9} index={0} />
    </g>;
  } else if (type === "canard") {
    geometry = <g>
      <path d="M0 -48Q-8 -25 -8 27L0 50L8 27Q8 -25 0 -48Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-7 -25L-61 -37L-69 -29L-37 -16L-68 -4L-59 3L-7 -6ZM7 -2L-130 -48L-144 -38L-55 -3L-141 37L-125 46L0 14L125 46L141 37L55 -3L144 -38L130 -48L7 -2Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-22 -20L-58 -29M22 -20L58 -29M-35 -18L-108 -39M35 -18L108 -39" className="legacy-svg-panel-line" />
      <Rotor x={0} y={54} radius={9} index={0} />
    </g>;
  } else if (type === "biplan") {
    geometry = <g>
      <path d="M0 -48Q-8 -20 -8 28L0 49L8 28Q8 -20 0 -48Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-8 -10L-114 -41L-126 -31L-53 -2L-126 25L-114 35L-8 12ZM8 -10L114 -41L126 -31L53 -2L126 25L114 35L8 12Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-7 22L-57 9L-63 16L-30 30L-62 44L-54 50L0 36L54 50L62 44L30 30L63 16L57 9L7 22Z" fill="#438e95" stroke="#b8fff2" strokeWidth="1.4" />
      <path d="M-45 5L-39 26M45 5L39 26M-38 -12L-33 24M38 -12L33 24" className="legacy-svg-strut" />
      <Rotor x={0} y={55} radius={8} index={0} />
    </g>;
  } else if (type === "double-poutre") {
    geometry = <g>
      <path d="M0 -45L-13 -14L-13 23L0 49L13 23L13 -14Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-12 -11L-124 -48L-139 -36L-59 0L-135 37L-120 48L-12 17ZM12 -11L124 -48L139 -36L59 0L135 37L120 48L12 17Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-27 9L-111 49M27 9L111 49M-111 49L-132 57M111 49L132 57" className="legacy-svg-boom" />
      <path d="M-132 50L-150 58L-129 66L-112 56M132 50L150 58L129 66L112 56" fill="#347e84" stroke="#b7fff4" strokeWidth="1.3" />
      <rect x="-9" y="-4" width="18" height="18" rx="5" fill={`url(#${glass})`} stroke="#eafff9" />
      <Rotor x={0} y={-50} radius={8} index={0} /><Rotor x={0} y={59} radius={8} index={1} />
    </g>;
  } else if (type === "effet-de-sol") {
    geometry = <g>
      <path d="M0 -42L-115 -39L-145 -19L-80 -2L-138 25L-120 37L0 18L120 37L138 25L80 -2L145 -19L115 -39Z" fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-120 39Q-93 52 -54 40M120 39Q93 52 54 40M-105 -18H105M-40 -2H40" className="legacy-svg-hull" />
      <path d="M-9 -31Q0 -39 9 -31V32Q0 42 -9 32Z" fill={`url(#${glass})`} stroke="#eafff9" />
      <path d="M-100 43L-89 57M100 43L89 57" className="legacy-svg-sponson" />
      <Rotor x={0} y={-44} radius={9} index={0} />
    </g>;
  } else {
    const longAspect = ["planeur", "hale-voilure", "male-voilure"].includes(type);
    const male = type === "male-voilure";
    const wingPath = longAspect
      ? "M0 -45L-147 -25L-151 -17L-20 -6L-143 7L-140 15L0 18L140 15L143 7L20 -6L151 -17L147 -25Z"
      : morphology === "flat"
        ? "M0 -46L-136 -39L-151 -28L-67 -4L-146 24L-130 37L0 19L130 37L146 24L67 -4L151 -28L136 -39Z"
        : morphology === "long" || morphology === "fusiform"
          ? "M0 -43L-154 -28L-160 -18L-40 -5L-151 17L-139 27L0 14L139 27L151 17L40 -5L160 -18L154 -28Z"
          : morphology === "surveillance"
            ? "M0 -48L-148 -57L-158 -43L-62 -6L-150 31L-135 45L0 22L135 45L150 31L62 -6L158 -43L148 -57Z"
            : morphology === "assistance"
              ? "M0 -42L-120 -59L-139 -43L-58 -5L-130 29L-112 43L0 21L112 43L130 29L58 -5L139 -43L120 -59Z"
              : "M0 -46L-126 -62L-145 -48L-59 -5L-139 33L-125 46L0 19L125 46L139 33L59 -5L145 -48L126 -62Z";
    geometry = <g>
      <path d={wingPath} fill={`url(#${skin})`} stroke="#d7fff5" strokeWidth="1.8" />
      <path d="M-34 -9L-132 -46M34 -9L132 -46M-31 5L-119 35M31 5L119 35" className="legacy-svg-panel-line" />
      {fuselage}
      {type === "planeur" && <path d="M-43 43L-66 52L-44 57L-21 47M43 43L66 52L44 57L21 47" fill="#347e84" stroke="#b7fff4" strokeWidth="1.2" />}
      {male && <path d="M-15 43L-29 58L-5 52M15 43L29 58L5 52" fill="none" stroke="#b7fff4" strokeWidth="2" />}
      {type === "hale-voilure" && <path d="M-140 -18H140M-105 -22L-105 -10M105 -22L105 -10" className="legacy-svg-spar" />}
      {type === "voilure-conventionnelle" && <path d="M-40 39L-53 52L-39 56L0 48L39 56L53 52L40 39Z" fill="#347e84" stroke="#b7fff4" strokeWidth="1.2" />}
      {type === "voilure-conventionnelle" && <Rotor x={0} y={52} radius={9} index={0} />}
      {type === "planeur" && <Rotor x={0} y={50} radius={7} index={0} />}
      {type === "hale-voilure" && <Rotor x={0} y={51} radius={8} index={0} />}
      {male && <Rotor x={0} y={58} radius={9} index={0} />}
    </g>;
  }

  return <div className="physical-drone-preview legacy-url-drone-image" style={{ touchAction: "none", cursor: "grab", position: "relative" }}
    onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); rotationDrag.current = { startX: event.clientX, angle: rotation }; }}
    onPointerMove={event => { const drag = rotationDrag.current; if (drag) setRotation(drag.angle + (event.clientX - drag.startX) * .8); }}
    onPointerUp={event => { rotationDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={event => { rotationDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
    <svg className="parametric-drone-preview" style={{ transform: `scale(${visualZoom})`, touchAction: "none" }} viewBox="0 0 320 174" role="img" tabIndex={0}
      aria-label={`${design.label}, maquette paramétrique ${type}, envergure ${span.toFixed(1)} mètres, ${motors} moteur(s). Glisser horizontalement pour faire tourner; flèches gauche/droite ou Home au clavier.`}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setRotation(value => value + (event.key === "ArrowRight" ? 15 : -15)); } else if (event.key === "Home") { event.preventDefault(); setRotation(0); } }}>
      <title>Rotation interactive : glisser horizontalement, utiliser les flèches gauche/droite, Home réinitialise.</title>
      <defs>
        <linearGradient id={skin} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#effff9" /><stop offset="0.42" stopColor="#69c8c2" /><stop offset="1" stopColor="#183b47" /></linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#eafff9" /><stop offset="1" stopColor="#398e9d" /></linearGradient>
        <pattern id={grid} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="rgba(117,226,220,.13)" strokeWidth=".45" /></pattern>
        <filter id={shadow} x="-40%" y="-50%" width="180%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" /><feOffset dy="7" /><feComponentTransfer><feFuncA type="linear" slope=".42" /></feComponentTransfer><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect x="0" y="0" width="320" height="174" fill={`url(#${grid})`} opacity=".45" />
      <path d="M160 12V151M30 82H290" className="legacy-svg-axis" />
      <g className="legacy-svg-body" transform={`translate(160 82) rotate(${rotation.toFixed(1)}) scale(${scaleX} ${scaleY})`} filter={`url(#${shadow})`}>{geometry}</g>
      <path d="M54 145H266M54 141V149M266 141V149" className="legacy-svg-dimension" />
      <text x="18" y="22" className="legacy-svg-label">AEROMIND / JUMEAU NUMÉRIQUE</text>
      <text x="302" y="22" textAnchor="end" className="legacy-svg-label">↻ {Math.round(rotation)}° · ROTATION</text>
      <text x="18" y="158" className="legacy-svg-spec">{type.toUpperCase()} · {span.toFixed(1)} M · {motors} MOTEUR{motors > 1 ? "S" : ""}</text>
      {construction && <text x="18" y="169" className="legacy-svg-build">STUDIO SYNC · {construction.parts} PIÈCES · {construction.massKg.toFixed(2)} KG</text>}
    </svg>
    {design.engineeringAssets && <nav className="parametric-cad-links" aria-label={`Fichiers source de ${design.label}`} onPointerDown={event => event.stopPropagation()}>
      <a href={design.engineeringAssets.hudSvg} target="_blank" rel="noreferrer" title="Ouvrir le dessin vectoriel HUD">HUD SVG</a>
      <a href={design.engineeringAssets.obj} download title="Télécharger le maillage OBJ">OBJ</a>
      <a href={design.engineeringAssets.stl} download title="Télécharger le maillage STL">STL</a>
      <a href={design.engineeringAssets.openScad} download title="Télécharger la source paramétrique OpenSCAD">SCAD</a>
    </nav>}
  </div>;
}
